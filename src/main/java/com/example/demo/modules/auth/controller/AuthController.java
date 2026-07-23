package com.example.demo.modules.auth.controller;

import com.example.demo.common.config.JwtTokenService;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.aro.client.CasClient;
import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.dto.CasTokenInfo;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.aro.token.TokenStore;
import com.example.demo.modules.auth.dto.CasLoginRequest;
import com.example.demo.modules.auth.dto.ChangePasswordRequest;
import com.example.demo.modules.auth.dto.ForgotPasswordResetRequest;
import com.example.demo.modules.auth.dto.ForgotPasswordVerifyRequest;
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
import com.example.demo.modules.auth.service.PasswordPolicyValidator;
import com.example.demo.modules.auth.service.StaffRegistrationService;
import com.example.demo.modules.auth.service.TurnstileVerificationService;
import com.example.demo.modules.invite.RegistrationInviteService;
import com.example.demo.common.util.QrCodeUtils;
import com.google.zxing.NotFoundException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@RestController
@RequestMapping("/api/auth")

@Tag(name = "认证模块", description = "Web与微信小程序统一认证接口")
public class AuthController {

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);

    private final UserMapper userMapper;
    private final AuthService authService;
    private final AuthContextService authContextService;
    private final PasswordCredentialService passwordCredentialService;
    private final RegistrationInviteService registrationInviteService;
    private final StaffRegistrationService staffRegistrationService;
    private final JwtTokenService jwtTokenService;
    private final AroPersonnelMapper aroPersonnelMapper;
    private final TurnstileVerificationService turnstileVerificationService;
    private final CasClient casClient;
    private final TokenStore tokenStore;

    public AuthController(UserMapper userMapper,
                          AuthService authService,
                          AuthContextService authContextService,
                          PasswordCredentialService passwordCredentialService,
                          RegistrationInviteService registrationInviteService,
                          StaffRegistrationService staffRegistrationService,
                          JwtTokenService jwtTokenService,
                          AroPersonnelMapper aroPersonnelMapper,
                          TurnstileVerificationService turnstileVerificationService,
                          CasClient casClient,
                          @Qualifier("cachedTokenStore") TokenStore tokenStore) {
        this.userMapper = userMapper;
        this.authService = authService;
        this.authContextService = authContextService;
        this.passwordCredentialService = passwordCredentialService;
        this.registrationInviteService = registrationInviteService;
        this.staffRegistrationService = staffRegistrationService;
        this.jwtTokenService = jwtTokenService;
        this.aroPersonnelMapper = aroPersonnelMapper;
        this.turnstileVerificationService = turnstileVerificationService;
        this.casClient = casClient;
        this.tokenStore = tokenStore;
    }

    @PostMapping("/login/web")
    @Operation(summary = "Web账号密码登录")
    public Result<?> loginWeb(@RequestBody WebLoginRequest request) {
        if (request == null || !StringUtils.hasText(request.getUsername()) || !StringUtils.hasText(request.getPassword())) {
            return Result.error("账号或密码错误");
        }

        String username = request.getUsername().trim();
        User user = userMapper.findByUsername(username);

        // ---- 1. Turnstile 人机验证 ----
        if (!turnstileVerificationService.verify(request.getTurnstileToken())) {
            return Result.error("人机验证未通过，请刷新页面重试");
        }

        // ---- 2. 账号锁定检查 ----
        if (user != null && user.getLoginLockedUntil() != null) {
            log.debug("账号处于锁定状态，检查是否过期: userId={}", user.getId());
            try {
                java.time.LocalDateTime lockedUntil = java.time.LocalDateTime.parse(
                        user.getLoginLockedUntil().replace(" ", "T"));
                if (lockedUntil.isAfter(java.time.LocalDateTime.now())) {
                    long remainSeconds = java.time.Duration.between(
                            java.time.LocalDateTime.now(), lockedUntil).getSeconds();
                    long remainMinutes = (long) Math.ceil(remainSeconds / 60.0);
                    return Result.error("账号已被锁定，请 " + remainMinutes + " 分钟后重试");
                }
                // 锁定已过期，自动解除
                log.info("账号锁定已过期，自动解除: userId={}", user.getId());
                userMapper.clearLoginFailCount(user.getId());
            } catch (Exception ignored) {
                // 时间解析异常时清除锁定（安全侧：宁可放行不让用户永久锁死）
                log.warn("登录锁定时间解析异常，强制清除: userId={}", user.getId());
                userMapper.clearLoginFailCount(user.getId());
            }
        }

        // ---- 3. 密码校验 ----
        if (user == null || !passwordCredentialService.verifyAndRehashIfLegacy(user, request.getPassword())) {
            if (user != null && !isDisabled(user)) {
                userMapper.incrementLoginFailCount(user.getId());
                // 失败 ≥5 次 → 锁定 15 分钟
                User afterFail = userMapper.findById(user.getId());
                if (afterFail != null && afterFail.getLoginFailCount() != null
                        && afterFail.getLoginFailCount() >= 5) {
                    String lockedUntil = java.time.LocalDateTime.now()
                            .plusMinutes(15).toString().replace("T", " ");
                    userMapper.lockUserUntil(user.getId(), lockedUntil);
                    log.warn("账号已锁定 15 分钟（连续5次密码错误）: userId={}, username={}",
                            user.getId(), user.getUsername());
                    return Result.error("密码错误次数过多，账号已锁定 15 分钟");
                }
            }
            return Result.error("账号或密码错误");
        }

        // ---- 4. 成功登录：清除失败计数 ----
        if (user.getLoginFailCount() != null && user.getLoginFailCount() > 0) {
            log.info("登录成功，清除失败计数: userId={}, previousFailCount={}",
                    user.getId(), user.getLoginFailCount());
        }
        userMapper.clearLoginFailCount(user.getId());

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

    @PostMapping("/login/cas")
    @Operation(summary = "CAS 统一认证登录")
    public Result<?> loginCas(@RequestBody @Valid CasLoginRequest request) {
        // ① Call ARO loginAuth — ARO internally validates ticket against its own CAS service URL.
        //    CAS only whitelists ARO's service URL for serviceValidate, so we must go through ARO.
        CasTokenInfo tokenInfo = casClient.exchangeTicket(request.getTicket());
        if (tokenInfo == null) {
            return Result.fail(403, "CAS 认证失败：无法验证 ticket，请重新登录");
        }

        String casAccount = tokenInfo.getAccount(); // YF0408
        String casName = tokenInfo.getUserKey();    // 位亚磊

        // ② Cross-match aro_personnel (name + jobNumber dual verification)
        AroPersonnel matched = aroPersonnelMapper.findByNameAndJobNumber(casName, casAccount);
        if (matched == null) {
            // Fallback: try job number only
            matched = aroPersonnelMapper.findByJobNumber(casAccount);
        }
        if (matched == null) {
            return Result.fail(403,
                    "未在人员库中找到匹配记录（账号: " + casAccount +
                    "，姓名: " + casName +
                    "）。请联系管理员将您的信息录入人员库。");
        }

        // ③ Look up sys_user (no auto-create)
        String matchedUserId = matched.getId();
        User user = userMapper.findById(matchedUserId);
        if (user == null) {
            return Result.fail(403,
                    "您在人员库中有记录（" + casName + "，" + casAccount +
                    "），但系统账号尚未开通。请联系管理员开通后再试。");
        }

        // ④ Save ARO Token for this user
        tokenStore.save(matchedUserId, tokenInfo);

        // ⑤ R12: Check account status
        if (isDisabled(user)) {
            return Result.fail(403, "账号已被禁用，请联系管理员");
        }

        // ⑥ R8: Ensure role is at least STAFF + persist
        if (user.getRole() == null || user.getRole().getLevel() < RoleEnum.STAFF.getLevel()) {
            user.setRole(RoleEnum.STAFF);
            userMapper.updateRoleById(user.getId(), RoleEnum.STAFF.getCode());
        }

        // ⑥ R25: Set auth profile to CAS_LOGIN (DB + in-memory)
        userMapper.updateAuthProfileById(user.getId(), AuthProfileConstants.CAS_LOGIN);
        user.setAuthProfile(AuthProfileConstants.CAS_LOGIN);

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

    @PostMapping("/token/refresh")
    @Operation(summary = "用当前 Token（含过期但未超过60天）换取新 Token，供前端自动续期")
    public Result<?> refreshToken(HttpServletRequest request) {
        String authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return Result.error("未提供 Token");
        }
        String token = authHeader.substring("Bearer ".length()).trim();
        if (token.isBlank()) {
            return Result.error("Token 为空");
        }
        User user = jwtTokenService.validateTokenForRefresh(token);
        if (user == null) {
            return Result.error("Token 无效或已超过刷新窗口，请重新登录");
        }
        User fresh = userMapper.findById(user.getId());
        if (fresh == null || (fresh.getStatus() != null && fresh.getStatus() == 0)) {
            return Result.error("账号不存在或已禁用");
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
        boolean canChange = StringUtils.hasText(user.getPassword());
        return Result.success(Map.of(
                "requiredReset", false,
                "canChange", canChange
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
    @Operation(summary = "修改个人密码（所有已登录用户均可使用）")
    public Result<?> changePasswordAfterReset(@RequestBody ChangePasswordRequest requestBody, HttpServletRequest request) {
        if (requestBody == null
                || !StringUtils.hasText(requestBody.getOldPassword())
                || !StringUtils.hasText(requestBody.getNewPassword())) {
            return Result.error("密码参数不合法");
        }
        String oldPassword = requestBody.getOldPassword().trim();
        String newPassword = requestBody.getNewPassword().trim();
        String pwError = PasswordPolicyValidator.validate(newPassword);
        if (pwError != null) {
            return Result.error(pwError);
        }
        if (oldPassword.equals(newPassword)) {
            return Result.error("新密码不能与旧密码一致");
        }

        User currentUser = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (currentUser == null) {
            return Result.error("未登录或登录态失效");
        }
        User refreshed = userMapper.findById(currentUser.getId());
        if (refreshed == null) {
            return Result.error("用户不存在");
        }
        if (!StringUtils.hasText(refreshed.getPassword())) {
            return Result.error("当前账号未设置密码，无法修改");
        }
        if (!passwordCredentialService.verifyAndRehashIfLegacy(refreshed, oldPassword)) {
            return Result.error("当前密码不正确");
        }
        userMapper.updatePasswordAndResetRequiredById(currentUser.getId(), passwordCredentialService.encodeForStorage(newPassword), 0);
        return Result.success();
    }

    @PostMapping("/forgot-password/decode-qr")
    @Operation(summary = "忘记密码：上传QR码图片解码用户ID（无需登录）")
    public Result<?> forgotPasswordDecodeQr(@RequestParam("file") MultipartFile file) {
        if (file == null || file.isEmpty()) {
            return Result.error("请上传二维码图片");
        }
        try {
            String text = QrCodeUtils.decode(file.getInputStream());
            String userId = text.trim();
            AroPersonnel personnel = aroPersonnelMapper.findByUserId(userId);
            if (personnel == null) {
                Pattern p19 = Pattern.compile("\\d{19}");
                Matcher m = p19.matcher(userId);
                if (m.find()) {
                    userId = m.group();
                    personnel = aroPersonnelMapper.findByUserId(userId);
                }
            }
            if (personnel == null) {
                return Result.error("二维码中的ID未在人员库中找到匹配，ID: " + userId);
            }
            Map<String, Object> data = new HashMap<>();
            data.put("userId", userId);
            data.put("name", personnel.getName() != null ? personnel.getName() : "");
            return Result.success(data);
        } catch (NotFoundException e) {
            return Result.error("二维码解析失败，请确认图片包含有效二维码");
        } catch (Exception e) {
            return Result.error("图片处理失败，请重试");
        }
    }

    @PostMapping("/forgot-password/verify")
    @Operation(summary = "忘记密码：验证用户ID和手机号（无需登录）")
    public Result<?> forgotPasswordVerify(@RequestBody ForgotPasswordVerifyRequest request) {
        if (request == null || !StringUtils.hasText(request.getUserId()) || !StringUtils.hasText(request.getPhoneNumber())) {
            return Result.error("用户ID和手机号不能为空");
        }
        String userId = request.getUserId().trim();
        AroPersonnel personnel = aroPersonnelMapper.findByUserId(userId);
        if (personnel == null) {
            return Result.error("用户ID不存在于人员库");
        }
        String dbPhone = personnel.getMobilePhone();
        if (dbPhone == null || dbPhone.isBlank()) {
            return Result.error("该人员在人员库中未登记手机号，请联系管理员");
        }
        if (!dbPhone.trim().equals(request.getPhoneNumber().trim())) {
            return Result.error("手机号不匹配");
        }
        User user = userMapper.findById(userId);
        String existingUsername = user != null && StringUtils.hasText(user.getUsername())
                ? user.getUsername() : userId;
        Map<String, Object> data = new HashMap<>();
        data.put("verified", true);
        data.put("username", existingUsername);
        data.put("name", personnel.getName() != null ? personnel.getName() : "");
        data.put("message", "验证通过");
        return Result.success(data);
    }

    @PostMapping("/forgot-password/reset")
    @Operation(summary = "忘记密码：重置密码（无需登录，需先通过 verify 验证）")
    public Result<?> forgotPasswordReset(@RequestBody ForgotPasswordResetRequest request) {
        if (request == null || !StringUtils.hasText(request.getUserId()) || !StringUtils.hasText(request.getNewPassword())) {
            return Result.error("参数不合法");
        }
        String userId = request.getUserId().trim();
        String newPassword = request.getNewPassword().trim();
        String pwError = PasswordPolicyValidator.validate(newPassword);
        if (pwError != null) {
            return Result.error(pwError);
        }
        AroPersonnel personnel = aroPersonnelMapper.findByUserId(userId);
        if (personnel == null) {
            return Result.error("用户不存在于人员库");
        }
        String hash = passwordCredentialService.encodeForStorage(newPassword);
        String encryptedPlain = passwordCredentialService.encryptPlaintext(newPassword);
        User user = userMapper.findById(userId);
        if (user == null) {
            // Auto-create sys_user for personnel
            String username = StringUtils.hasText(request.getNewUsername())
                    ? request.getNewUsername().trim() : userId;
            if (username.length() < 2 || username.length() > 64) {
                return Result.error("账号长度须在 2～64 字符");
            }
            User existingByUsername = userMapper.findByUsername(username);
            if (existingByUsername != null) {
                return Result.error("该登录账号已被占用");
            }
            User newUser = new User();
            newUser.setId(userId);
            newUser.setUsername(username);
            newUser.setPassword(hash);
            newUser.setRole(RoleEnum.MEMBER);
            newUser.setStatus(1);
            newUser.setPasswordResetRequired(0);
            newUser.setAuthProfile(AuthProfileConstants.WEB_PASSWORD);
            newUser.setAccountSource("STUDENT");
            userMapper.insertUser(newUser);
            userMapper.updatePasswordWithPlainById(userId, hash, encryptedPlain, 0);
        } else {
            if (StringUtils.hasText(request.getNewUsername())) {
                String newUsername = request.getNewUsername().trim();
                if (newUsername.length() < 2 || newUsername.length() > 64) {
                    return Result.error("账号长度须在 2～64 字符");
                }
                User existingByUsername = userMapper.findByUsername(newUsername);
                if (existingByUsername != null && !existingByUsername.getId().equals(userId)) {
                    return Result.error("该登录账号已被占用");
                }
                userMapper.updateUsernameById(userId, newUsername);
            }
            userMapper.updatePasswordWithPlainById(userId, hash, encryptedPlain, 0);
        }
        Map<String, Object> data = new HashMap<>();
        data.put("message", "密码重置成功，请返回登录");
        return Result.success(data);
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
            user.setRole(RoleEnum.MEMBER);
            user.setOpenId(request.getOpenId());
            user.setMiniBindType("STUDENT");
            user.setAuthProfile(AuthProfileConstants.WECHAT_ARO);
            user.setAccountSource("STUDENT");
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
