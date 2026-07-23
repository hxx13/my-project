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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

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
        String serviceUrl = body.get("serviceUrl");
        if (ticket == null || ticket.isBlank()) return Result.fail(400, "ticket 不能为空");
        if (serviceUrl == null || serviceUrl.isBlank()) return Result.fail(400, "serviceUrl 不能为空");

        // Direct CAS serviceValidate — ticket was issued for OUR service URL
        CasUserInfo casUser = casClient.validateTicket(ticket, serviceUrl);
        if (casUser == null) return Result.fail(400, "CAS 认证失败：ticket 无效或已过期");

        // Store CAS identity (ARO JWT acquisition via CASTGC flow to be added later)
        CasTokenInfo tokenInfo = new CasTokenInfo();
        tokenInfo.setToken(""); // no JWT yet — requires CASTGC flow
        tokenInfo.setAccount(casUser.getAccount());
        tokenInfo.setAroUserId(casUser.getId());
        tokenInfo.setUserKey(casUser.getUsername());
        tokenInfo.setExp(0L);
        tokenStore.save(user.getId(), tokenInfo);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("casAccount", casUser.getAccount());
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

    // ========== 私有工具方法 ==========

    private User resolveUser(HttpServletRequest request) {
        return authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
    }
}
