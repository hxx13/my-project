package com.example.demo.modules.auth.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.dto.ChangePasswordRequest;
import com.example.demo.modules.auth.dto.RegisterStaffRequest;
import com.example.demo.modules.auth.dto.UpdateDisplayNicknameRequest;
import com.example.demo.modules.auth.AuthProfileConstants;
import com.example.demo.modules.auth.dto.WechatBindRequest;
import com.example.demo.modules.auth.dto.WechatLoginRequest;
import com.example.demo.modules.auth.dto.WechatUnboundResponse;
import com.example.demo.modules.auth.dto.WebLoginRequest;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.auth.service.AuthService;
import com.example.demo.modules.auth.service.PasswordCredentialService;
import com.example.demo.modules.auth.service.StaffRegistrationService;
import com.example.demo.modules.invite.RegistrationInviteService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin("*")
@Tag(name = "认证模块", description = "Web与微信小程序统一认证接口")
public class AuthController {

    private final UserMapper userMapper;
    private final AuthService authService;
    private final AuthContextService authContextService;
    private final PasswordCredentialService passwordCredentialService;
    private final RegistrationInviteService registrationInviteService;
    private final StaffRegistrationService staffRegistrationService;

    public AuthController(UserMapper userMapper,
                          AuthService authService,
                          AuthContextService authContextService,
                          PasswordCredentialService passwordCredentialService,
                          RegistrationInviteService registrationInviteService,
                          StaffRegistrationService staffRegistrationService) {
        this.userMapper = userMapper;
        this.authService = authService;
        this.authContextService = authContextService;
        this.passwordCredentialService = passwordCredentialService;
        this.registrationInviteService = registrationInviteService;
        this.staffRegistrationService = staffRegistrationService;
    }

    @PostMapping("/login/web")
    @Operation(summary = "Web账号密码登录")
    public Result<?> loginWeb(@RequestBody WebLoginRequest request) {
        if (request == null || !StringUtils.hasText(request.getUsername()) || !StringUtils.hasText(request.getPassword())) {
            return Result.error("账号或密码错误");
        }
        User user = userMapper.findByUsername(request.getUsername().trim());
        if (user == null || !passwordCredentialService.verifyAndRehashIfLegacy(user, request.getPassword())) {
            return Result.error("账号或密码错误");
        }
        if (isDisabled(user)) {
            return Result.error("账号已禁用");
        }
        userMapper.updateAuthProfileById(user.getId(), AuthProfileConstants.WEB_PASSWORD);
        User refreshed = userMapper.findById(user.getId());
        if (refreshed != null) {
            user = refreshed;
        }
        user.setRole(authService.normalizeRole(user.getRole()));
        return authService.generateAuthResult(user);
    }

    @PostMapping("/register/staff")
    @Operation(summary = "教职工注册")
    public Result<?> registerStaff(@RequestBody RegisterStaffRequest request) {
        return staffRegistrationService.register(request);
    }

    @PostMapping("/registration-invites/personal")
    @Operation(summary = "教职工自助生成一条 3 天有效推荐码（明文仅本次返回）")
    public Result<?> createPersonalRegistrationInvite(HttpServletRequest request) {
        User me = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (me == null) {
            return Result.error("未登录或Token无效");
        }
        RoleEnum role = authService.normalizeRole(me.getRole());
        if (role.getLevel() < RoleEnum.STAFF.getLevel()) {
            return Result.error("仅教职工可生成推荐码");
        }
        try {
            return Result.success(registrationInviteService.createPersonalInvite(me.getId()));
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        } catch (IllegalStateException ex) {
            return Result.error(ex.getMessage());
        }
    }

    @PostMapping("/login/wechat")
    @Operation(summary = "微信静默登录")
    public ResponseEntity<?> loginWechat(@RequestBody WechatLoginRequest request) {
        if (request == null || !StringUtils.hasText(request.getJsCode())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new WechatUnboundResponse(""));
        }
        String openId = authService.exchangeJsCodeForOpenId(request.getJsCode());
        User user = userMapper.findByOpenId(openId);
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new WechatUnboundResponse(openId));
        }
        if (isDisabled(user)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Result.error("账号已禁用"));
        }
        user.setRole(authService.normalizeRole(user.getRole()));
        return ResponseEntity.ok(authService.generateAuthResult(user));
    }

    @PostMapping("/session/refresh")
    @Operation(summary = "用当前 Token 从库中重载用户并返回最新会话（含角色），学生/教职工绑定后均可调用")
    public Result<?> refreshSession(HttpServletRequest request) {
        User current = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (current == null) {
            return Result.error("未登录或Token无效");
        }
        if (isDisabled(current)) {
            return Result.error("账号已禁用");
        }
        User fresh = userMapper.findById(current.getId());
        if (fresh == null) {
            return Result.error("用户不存在");
        }
        if (isDisabled(fresh)) {
            return Result.error("账号已禁用");
        }
        fresh.setRole(authService.normalizeRole(fresh.getRole()));
        return authService.generateAuthResult(fresh);
    }

    @PostMapping("/bind/wechat")
    @Operation(summary = "微信绑定账号")
    public Result<?> bindWechat(@RequestBody WechatBindRequest request, HttpServletRequest httpRequest) {
        if (request == null
                || !StringUtils.hasText(request.getBindType())
                || !StringUtils.hasText(request.getIdentifier())
                || !StringUtils.hasText(request.getOpenId())) {
            return Result.error("绑定参数不合法");
        }

        String bindType = request.getBindType().trim().toUpperCase(Locale.ROOT);
        return switch (bindType) {
            case "STUDENT" -> bindStudent(request, httpRequest);
            case "STAFF" -> bindStaff(request);
            default -> Result.error("绑定参数不合法");
        };
    }

    @PostMapping("/password/status")
    @Operation(summary = "查询当前账号是否允许修改密码")
    public Result<?> passwordChangeStatus(HttpServletRequest request) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) {
            return Result.error("未登录或登录态失效");
        }
        RoleEnum role = authService.normalizeRole(user.getRole());
        if (role.getLevel() < RoleEnum.STAFF.getLevel()) {
            return Result.error("仅教职工账号支持该操作");
        }
        boolean required = user.getPasswordResetRequired() != null && user.getPasswordResetRequired() == 1;
        return Result.success(Map.of(
                "requiredReset", required,
                "canChange", required
        ));
    }

    @PatchMapping("/profile/display-nickname")
    @Operation(summary = "修改展示昵称（仅无人员库且账号密码绑定微信的教职工账号）")
    public Result<?> updateDisplayNickname(@RequestBody(required = false) UpdateDisplayNicknameRequest requestBody,
                                           HttpServletRequest request) {
        User current = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (current == null) {
            return Result.error("未登录或登录态失效");
        }
        User existing = userMapper.findById(current.getId());
        if (existing == null) {
            return Result.error("用户不存在");
        }
        if (!authService.canSelfEditDisplayNickname(existing)) {
            return Result.error("当前账号不支持修改展示名称");
        }
        String raw = requestBody != null ? requestBody.getDisplayNickname() : null;
        String normalized = normalizeDisplayNickname(raw);
        if (normalized != null && normalized.length() > 32) {
            return Result.error("昵称长度不能超过32个字符");
        }
        userMapper.updateDisplayNicknameById(existing.getId(), normalized);
        User fresh = userMapper.findById(existing.getId());
        if (fresh == null) {
            return Result.error("用户不存在");
        }
        fresh.setRole(authService.normalizeRole(fresh.getRole()));
        return authService.generateAuthResult(fresh);
    }

    @PostMapping("/password/change")
    @Operation(summary = "教职工在重置后修改个人密码")
    public Result<?> changePasswordAfterReset(@RequestBody ChangePasswordRequest requestBody, HttpServletRequest request) {
        if (requestBody == null
                || !StringUtils.hasText(requestBody.getOldPassword())
                || !StringUtils.hasText(requestBody.getNewPassword())) {
            return Result.error("密码参数不合法");
        }
        String oldPassword = requestBody.getOldPassword().trim();
        String newPassword = requestBody.getNewPassword().trim();
        if (newPassword.length() < 6 || newPassword.length() > 64) {
            return Result.error("新密码长度需在6-64位之间");
        }
        if (oldPassword.equals(newPassword)) {
            return Result.error("新密码不能与旧密码一致");
        }

        User currentUser = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (currentUser == null) {
            return Result.error("未登录或登录态失效");
        }
        RoleEnum role = authService.normalizeRole(currentUser.getRole());
        if (role.getLevel() < RoleEnum.STAFF.getLevel()) {
            return Result.error("仅教职工账号支持该操作");
        }
        if (currentUser.getPasswordResetRequired() == null || currentUser.getPasswordResetRequired() != 1) {
            return Result.error("当前账号未处于重置后改密状态");
        }
        User refreshed = userMapper.findById(currentUser.getId());
        if (refreshed == null) {
            return Result.error("用户不存在");
        }
        if (!passwordCredentialService.verifyAndRehashIfLegacy(refreshed, oldPassword)) {
            return Result.error("当前密码不正确");
        }
        userMapper.updatePasswordAndResetRequiredById(currentUser.getId(), passwordCredentialService.encodeForStorage(newPassword), 0);
        return Result.success();
    }

    private Result<?> bindStudent(WechatBindRequest request, HttpServletRequest httpRequest) {
        String id = request.getIdentifier().trim();
        Result<?> openIdConflict = validateOpenIdNotOccupied(request.getOpenId(), id);
        if (openIdConflict != null) {
            return openIdConflict;
        }

        int existed = userMapper.existsPersonnelById(id);
        if (existed < 1) {
            userMapper.insertBindAudit(
                    request.getOpenId(),
                    request.getIdentifier(),
                    "STUDENT",
                    resolveClientIp(httpRequest),
                    "PENDING",
                    "人员结构库不存在该学号"
            );
            return Result.error("学号不存在于人员库，请联系管理员处理");
        }

        User user = userMapper.findById(id);
        if (user == null) {
            user = new User();
            user.setId(id);
            user.setUsername(id);
            user.setRole(RoleEnum.STUDENT);
            user.setOpenId(request.getOpenId());
            user.setMiniBindType("STUDENT");
            user.setAuthProfile(AuthProfileConstants.WECHAT_ARO);
            userMapper.insertUser(user);
        } else {
            userMapper.updateOpenIdById(id, request.getOpenId(), "STUDENT");
            userMapper.updateAuthProfileById(id, AuthProfileConstants.WECHAT_ARO);
            user = userMapper.findById(id);
        }

        user.setRole(authService.normalizeRole(user.getRole()));
        return authService.generateAuthResult(user);
    }

    private Result<?> bindStaff(WechatBindRequest request) {
        String identifier = request.getIdentifier().trim();
        String password = request.getPassword();
        if (!StringUtils.hasText(password)) {
            return Result.error("账号或密码错误");
        }
        User user = userMapper.findByUsername(identifier);
        if (user == null) {
            user = userMapper.findById(identifier);
        }

        if (user == null || !passwordCredentialService.verifyAndRehashIfLegacy(user, password)) {
            return Result.error("账号或密码错误");
        }
        if (isDisabled(user)) {
            return Result.error("账号已禁用");
        }

        Result<?> openIdConflict = validateOpenIdNotOccupied(request.getOpenId(), user.getId());
        if (openIdConflict != null) {
            return openIdConflict;
        }

        userMapper.updateOpenIdById(user.getId(), request.getOpenId(), "STAFF");
        userMapper.updateAuthProfileById(user.getId(), AuthProfileConstants.WECHAT_ARO);
        user = userMapper.findById(user.getId());
        user.setRole(authService.normalizeRole(user.getRole()));
        return authService.generateAuthResult(user);
    }

    private boolean isDisabled(User user) {
        return user.getStatus() != null && user.getStatus() == 0;
    }

    private Result<?> validateOpenIdNotOccupied(String openId, String currentUserId) {
        User existing = userMapper.findByOpenId(openId);
        if (existing != null && !existing.getId().equals(currentUserId)) {
            return Result.error("该微信已绑定其他账号");
        }
        return null;
    }

    private String resolveClientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    /** null 或空白表示清空昵称 */
    private String normalizeDisplayNickname(String raw) {
        if (raw == null) {
            return null;
        }
        String t = raw.trim();
        return t.isEmpty() ? null : t;
    }
}
