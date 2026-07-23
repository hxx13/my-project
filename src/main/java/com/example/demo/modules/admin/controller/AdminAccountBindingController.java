package com.example.demo.modules.admin.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.aro.client.CasClient;
import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.dto.CasTokenInfo;
import com.example.demo.modules.aro.dto.CasUserInfo;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.aro.token.TokenStore;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.entity.UserAroBinding;
import com.example.demo.modules.auth.mapper.UserAroBindingMapper;
import com.example.demo.modules.auth.mapper.UserMapper;
import jakarta.servlet.http.HttpServletRequest;
import com.example.demo.modules.aro.client.CasClient;
import com.example.demo.modules.aro.client.CasLoginException;
import com.example.demo.modules.aro.dto.CasLoginSession;
import com.example.demo.modules.aro.dto.CasTokenInfo;
import com.example.demo.modules.aro.token.TokenStore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@RestController
@RequestMapping("/api/admin")
public class AdminAccountBindingController {

    private static final Logger log = LoggerFactory.getLogger(AdminAccountBindingController.class);

    private final UserAroBindingMapper userAroBindingMapper;
    private final AroPersonnelMapper aroPersonnelMapper;
    private final AuthContextService authContextService;
    private final UserMapper userMapper;
    private final CasClient casClient;
    private final TokenStore tokenStore;
    private final ConcurrentHashMap<String, CasLoginSession> casSessionMap = new ConcurrentHashMap<>();

    public AdminAccountBindingController(UserAroBindingMapper userAroBindingMapper,
                                         AroPersonnelMapper aroPersonnelMapper,
                                         AuthContextService authContextService,
                                         UserMapper userMapper,
                                         CasClient casClient,
                                         @Qualifier("cachedTokenStore") TokenStore tokenStore) {
        this.userAroBindingMapper = userAroBindingMapper;
        this.aroPersonnelMapper = aroPersonnelMapper;
        this.authContextService = authContextService;
        this.userMapper = userMapper;
        this.casClient = casClient;
        this.tokenStore = tokenStore;
    }

    @GetMapping("/account/binding")
    public Result<?> getBinding(HttpServletRequest request) {
        User user = resolveUser(request);
        if (user == null) {
            return Result.fail(401, "未登录或 Token 无效");
        }

        UserAroBinding binding = userAroBindingMapper.selectByUserId(user.getId());
        if (binding == null) {
            return Result.success(null);
        }

        AroPersonnel personnel = aroPersonnelMapper.findByUserId(binding.getAroUserId());

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("aroUserId", binding.getAroUserId());
        data.put("name", personnel != null ? personnel.getName() : null);
        data.put("departmentName", personnel != null ? personnel.getDepartmentName() : null);
        data.put("createdAt", binding.getCreatedAt());
        return Result.success(data);
    }

    @PostMapping("/account/bind-aro")
    public Result<?> bindAro(@RequestBody Map<String, String> body, HttpServletRequest request) {
        User user = resolveUser(request);
        if (user == null) {
            return Result.fail(401, "未登录或 Token 无效");
        }

        String aroUserId = body.get("aroUserId");
        if (aroUserId == null || aroUserId.isBlank()) {
            return Result.fail(400, "aroUserId 不能为空");
        }

        AroPersonnel personnel = aroPersonnelMapper.findByUserId(aroUserId);
        if (personnel == null) {
            return Result.fail(400, "ARO 人员不存在");
        }

        UserAroBinding existingByAro = userAroBindingMapper.selectByAroUserId(aroUserId);
        if (existingByAro != null && !existingByAro.getUserId().equals(user.getId())) {
            return Result.fail(409, "该 ARO 人员已被其他用户绑定");
        }

        userAroBindingMapper.deleteByUserId(user.getId());

        UserAroBinding newBinding = new UserAroBinding();
        newBinding.setUserId(user.getId());
        newBinding.setAroUserId(aroUserId);
        newBinding.setCreatedAt(LocalDateTime.now());
        userAroBindingMapper.insert(newBinding);

        // 自动为 ARO 人员创建 sys_user 注册记录（若不存在），
        // 使模拟身份切换时走正常登录流程，数据自然合并。
        User aroUser = userMapper.findById(aroUserId);
        if (aroUser == null) {
            aroUser = new User();
            aroUser.setId(aroUserId);
            aroUser.setUsername(aroUserId);
            aroUser.setRole(RoleEnum.MEMBER);
            aroUser.setStatus(1);
            aroUser.setAuthProfile("ARO_BOUND");
            userMapper.insertUser(aroUser);
            log.info("auto-created sys_user for bound ARO person: {}", aroUserId);
        }

        return Result.success();
    }

    @DeleteMapping("/account/bind-aro")
    public Result<?> unbindAro(HttpServletRequest request) {
        User user = resolveUser(request);
        if (user == null) {
            return Result.fail(401, "未登录或 Token 无效");
        }

        userAroBindingMapper.deleteByUserId(user.getId());
        return Result.success();
    }

    @DeleteMapping("/personnel/{userId}/aro-binding")
    public Result<?> adminUnbindAro(@PathVariable String userId, HttpServletRequest request) {
        User user = resolveUser(request);
        if (user == null) {
            return Result.fail(401, "未登录或 Token 无效");
        }

        if (user.getRole() == null || user.getRole().getLevel() < RoleEnum.SUPER_ADMIN.getLevel()) {
            return Result.fail(403, "无权限访问");
        }

        userAroBindingMapper.deleteByUserId(userId);
        return Result.success();
    }

    @GetMapping("/aro-bindings")
    public Result<List<Map<String, Object>>> listAllBindings(HttpServletRequest request) {
        User user = resolveUser(request);
        if (user == null) return Result.fail(401, "未登录");
        if (user.getRole().getLevel() < RoleEnum.SUPER_ADMIN.getLevel())
            return Result.fail(403, "权限不足");

        List<UserAroBinding> bindings = userAroBindingMapper.selectAll();
        List<Map<String, Object>> result = new ArrayList<>();
        for (UserAroBinding b : bindings) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("userId", b.getUserId());
            item.put("aroUserId", b.getAroUserId());
            AroPersonnel p = aroPersonnelMapper.findByUserId(b.getAroUserId());
            item.put("name", p != null ? p.getName() : "");
            item.put("departmentName", p != null ? p.getDepartmentName() : "");
            item.put("createdAt", b.getCreatedAt() != null ? b.getCreatedAt().toString() : "");
            result.add(item);
        }
        return Result.success(result);
    }

    // ========== CAS 个人 Token 绑定 ==========

    @PostMapping("/account/binding/cas-bind")
    public Result<?> bindCas(@RequestBody Map<String, String> body, HttpServletRequest request) {
        User user = resolveUser(request);
        if (user == null) return Result.fail(401, "未登录");

        String ticket = body.get("ticket");
        if (ticket == null || ticket.isBlank()) return Result.fail(400, "ticket 不能为空");

        // Use ARO loginAuth which validates against its own CAS service URL
        CasTokenInfo tokenInfo = casClient.exchangeTicket(ticket);
        if (tokenInfo == null) return Result.fail(400, "CAS 认证失败：ticket 无效或已过期");

        tokenStore.save(user.getId(), tokenInfo);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("casAccount", tokenInfo.getAccount());
        data.put("bound", true);
        return Result.success(data);
    }

    @GetMapping("/account/binding/cas-status")
    public Result<?> getCasStatus(HttpServletRequest request) {
        User user = resolveUser(request);
        if (user == null) return Result.fail(401, "未登录");

        boolean exists = tokenStore.exists(user.getId());
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("bound", exists);
        if (exists) {
            CasTokenInfo info = tokenStore.load(user.getId());
            data.put("casAccount", info != null ? info.getAccount() : null);
            if (info != null && info.getExp() > 0) {
                data.put("expiresAt", info.getExp());
                long remainingSec = info.getExp() - System.currentTimeMillis() / 1000;
                data.put("remainingSeconds", Math.max(0, remainingSec));
            }
        }
        return Result.success(data);
    }

    @PostMapping("/account/binding/cas-renew")
    public Result<?> renewCas(HttpServletRequest request) {
        User user = resolveUser(request);
        if (user == null) return Result.fail(401, "未登录");

        CasTokenInfo info = tokenStore.load(user.getId());
        if (info == null) return Result.fail(400, "未绑定 CAS 账号");

        return Result.fail(400, "Token 续期需要重新 CAS 登录。请解绑后重新绑定。");
    }

    @DeleteMapping("/account/binding/cas-unbind")
    public Result<?> unbindCas(HttpServletRequest request) {
        User user = resolveUser(request);
        if (user == null) return Result.fail(401, "未登录");

        tokenStore.delete(user.getId());
        return Result.success();
    }

    // ========== CAS 代理登录（方案 1：后端捕获 CASTGC） ==========

    /**
     * 获取 CAS 验证码图片。临时存储 CasLoginSession，后续提交时使用。
     */
    @GetMapping("/account/binding/cas-captcha")
    public ResponseEntity<byte[]> getCasCaptcha(HttpServletRequest request) {
        User user = resolveUser(request);
        if (user == null) return ResponseEntity.status(401).build();

        try {
            CasLoginSession session = casClient.fetchLoginSession();
            byte[] captchaBytes = casClient.fetchCaptcha(session);

            // 用 userId 暂存 session（覆盖旧 session）
            casSessionMap.put(user.getId(), session);

            return ResponseEntity.ok()
                    .contentType(MediaType.IMAGE_JPEG)
                    .body(captchaBytes);
        } catch (Exception e) {
            log.error("获取 CAS 验证码失败", e);
            return ResponseEntity.status(502).build();
        }
    }

    /**
     * 代理 CAS 登录：用用户提供的凭据完成 CAS 认证，捕获 CASTGC，
     * 然后用 CASTGC 获取 ARO 的 ticket → JWT → 存储。
     */
    @PostMapping("/account/binding/cas-acquire")
    public Result<?> acquireCasToken(@RequestBody Map<String, String> body, HttpServletRequest request) {
        User user = resolveUser(request);
        if (user == null) return Result.fail(401, "未登录");

        String username = body.get("username");
        String password = body.get("password");
        String captcha = body.get("captcha");
        if (username == null || username.isBlank()) return Result.fail(400, "请输入 CAS 账号");
        if (password == null || password.isBlank()) return Result.fail(400, "请输入 CAS 密码");
        if (captcha == null || captcha.isBlank()) return Result.fail(400, "请输入验证码");

        // 获取之前暂存的 CAS session
        CasLoginSession session = casSessionMap.remove(user.getId());
        if (session == null) {
            // 未获取验证码 → 新开一个 session
            try {
                session = casClient.fetchLoginSession();
            } catch (Exception e) {
                return Result.fail(502, "无法连接 CAS 服务器");
            }
        }

        try {
            // ① 提交 CAS 登录 → 获取 CASTGC
            String tgc = casClient.submitLogin(session, username, password, captcha, null);
            if (tgc == null || tgc.isBlank()) {
                return Result.fail(400, "CAS 登录失败：无法获取 CASTGC");
            }

            // ② 用 CASTGC 获取 ARO service ticket → ARO JWT
            CasTokenInfo tokenInfo = casClient.acquireTokenViaTgc(tgc);
            if (tokenInfo == null) {
                return Result.fail(400, "获取 ARO Token 失败：CASTGC 可能已过期");
            }

            // ③ 保存 Token
            tokenStore.save(user.getId(), tokenInfo);

            Map<String, Object> data = new LinkedHashMap<>();
            data.put("casAccount", tokenInfo.getAccount());
            data.put("bound", true);
            log.info("CAS 代理登录成功: userId={}, casAccount={}", user.getId(), tokenInfo.getAccount());
            return Result.success(data);
        } catch (CasLoginException e) {
            return Result.fail(400, e.getMessage());
        } catch (Exception e) {
            log.error("CAS 代理登录异常", e);
            return Result.fail(500, "CAS 登录异常，请重试");
        }
    }

    // ========== 私有工具方法 ==========

    private User resolveUser(HttpServletRequest request) {
        return authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
    }
}
