package com.example.demo.modules.auth.service;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.AuthProfileConstants;
import com.example.demo.modules.auth.dto.RegisterStaffRequest;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.invite.RegistrationInviteService;
import com.example.demo.modules.personnel.service.PersonnelService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.UUID;

@Service
public class StaffRegistrationService {

    private final UserMapper userMapper;
    private final AuthService authService;
    private final PasswordCredentialService passwordCredentialService;
    private final RegistrationInviteService registrationInviteService;
    private final PersonnelService personnelService;

    public StaffRegistrationService(UserMapper userMapper,
                                    AuthService authService,
                                    PasswordCredentialService passwordCredentialService,
                                    RegistrationInviteService registrationInviteService,
                                    PersonnelService personnelService) {
        this.userMapper = userMapper;
        this.authService = authService;
        this.passwordCredentialService = passwordCredentialService;
        this.registrationInviteService = registrationInviteService;
        this.personnelService = personnelService;
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<?> register(RegisterStaffRequest request) {
        if (request == null || !StringUtils.hasText(request.getUsername()) || !StringUtils.hasText(request.getPassword())) {
            return Result.error("账号或密码不合法");
        }
        String username = request.getUsername().trim();
        if (username.length() < 3 || username.length() > 64) {
            return Result.error("账号不合法");
        }
        String realName = request.getName() == null ? "" : request.getName().trim();
        if (realName.isEmpty()) {
            return Result.error("请填写真实姓名（与登录账号无关）");
        }
        if (realName.length() > 128) {
            return Result.error("真实姓名不能超过128个字符");
        }
        String rawPwd = request.getPassword().trim();
        String pwError = PasswordPolicyValidator.validate(rawPwd);
        if (pwError != null) {
            return Result.error(pwError);
        }
        if (userMapper.findByUsername(username) != null) {
            return Result.error("账号已存在");
        }
        if (!StringUtils.hasText(request.getInviteCode())) {
            return Result.error("请输入有效推荐码");
        }
        try {
            registrationInviteService.consumePlainCodeOrThrow(request.getInviteCode());
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }

        String hash = passwordCredentialService.encodeForStorage(rawPwd);
        String encryptedPlain = passwordCredentialService.encryptPlaintext(rawPwd);
        String id = "STAFF_" + UUID.randomUUID().toString().replace("-", "");
        User user = new User();
        user.setId(id);
        user.setUsername(username);
        user.setPassword(hash);
        user.setRole(RoleEnum.STAFF);
        user.setStatus(1);
        user.setPasswordResetRequired(0);
        user.setAuthProfile(AuthProfileConstants.WEB_PASSWORD);
        user.setAccountSource("STAFF");
        userMapper.insertUser(user);
        userMapper.updatePasswordWithPlainById(id, hash, encryptedPlain, 0);
        try {
            // 真实姓名 → sys_user.name + personnel；绝不把姓名写成 username
            personnelService.ensureStaffPersonnel(id, realName, RoleEnum.STAFF.getCode());
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
        user = userMapper.findById(user.getId());
        user.setRole(authService.normalizeRole(user.getRole()));
        return authService.generateAuthResult(user);
    }
}
