package com.example.demo.modules.auth.service;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.AuthProfileConstants;
import com.example.demo.modules.auth.dto.RegisterStaffRequest;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.invite.RegistrationInviteService;
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

    public StaffRegistrationService(UserMapper userMapper,
                                    AuthService authService,
                                    PasswordCredentialService passwordCredentialService,
                                    RegistrationInviteService registrationInviteService) {
        this.userMapper = userMapper;
        this.authService = authService;
        this.passwordCredentialService = passwordCredentialService;
        this.registrationInviteService = registrationInviteService;
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<?> register(RegisterStaffRequest request) {
        if (request == null || !StringUtils.hasText(request.getUsername()) || !StringUtils.hasText(request.getPassword())) {
            return Result.error("账号或密码不合法");
        }
        String username = request.getUsername().trim();
        if (username.length() < 3 || username.length() > 64 || request.getPassword().length() < 6) {
            return Result.error("账号或密码不合法");
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

        User user = new User();
        user.setId("STAFF_" + UUID.randomUUID().toString().replace("-", ""));
        user.setUsername(username);
        user.setPassword(passwordCredentialService.encodeForStorage(request.getPassword()));
        user.setRole(RoleEnum.STAFF);
        user.setStatus(1);
        user.setPasswordResetRequired(0);
        user.setAuthProfile(AuthProfileConstants.WEB_PASSWORD);
        userMapper.insertUser(user);
        user = userMapper.findById(user.getId());
        user.setRole(authService.normalizeRole(user.getRole()));
        return authService.generateAuthResult(user);
    }
}
