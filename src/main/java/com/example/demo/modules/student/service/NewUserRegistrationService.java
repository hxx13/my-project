package com.example.demo.modules.student.service;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.auth.service.AuthService;
import com.example.demo.modules.personnel.service.PersonnelAccountProvisioner;
import com.example.demo.modules.personnel.service.PersonnelAccountProvisioner.NewPersonSpec;
import com.example.demo.modules.student.dto.NewUserRegisterRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * 全新用户注册（新人员总闸门 app.registration.open 开启后可用）。
 * 承接统一认证引导过来的校外人员（idpUid 可选）：账号名由用户自填、手机号独立存，accountSource=OUTSIDER。
 */
@Service
public class NewUserRegistrationService {

    private final boolean registrationOpen;
    private final PersonnelAccountProvisioner provisioner;
    private final AuthService authService;
    private final UserMapper userMapper;

    public NewUserRegistrationService(
            @Value("${app.registration.open:false}") boolean registrationOpen,
            PersonnelAccountProvisioner provisioner,
            AuthService authService,
            UserMapper userMapper) {
        this.registrationOpen = registrationOpen;
        this.provisioner = provisioner;
        this.authService = authService;
        this.userMapper = userMapper;
    }

    public Result<?> register(NewUserRegisterRequest req) {
        if (!registrationOpen) {
            return Result.fail(403, "注册暂未开放，请联系管理员");
        }
        if (req == null || !StringUtils.hasText(req.getName())) {
            return Result.fail(400, "姓名不能为空");
        }
        if (!StringUtils.hasText(req.getMobilePhone())) {
            return Result.fail(400, "手机号不能为空");
        }
        // 手机号也是登录入口，不能让两个账号共用（否则登录时分不清是谁）。
        // 历史数据里有重号，用 findAll 而不是 findBy —— 任何一个已绑定都要拒。
        if (!userMapper.findAllByMobilePhone(req.getMobilePhone().trim()).isEmpty()) {
            return Result.fail(409, "该手机号已被其他账号绑定，请换一个");
        }
        // 账号名是登录名，与手机号是两个独立字段
        if (!StringUtils.hasText(req.getUsername())) {
            return Result.fail(400, "账号名不能为空");
        }
        String username = req.getUsername().trim();
        if (username.length() < 3 || username.length() > 64) {
            return Result.fail(400, "账号名长度需在 3-64 个字符之间");
        }
        if (req.getGender() == null) {
            return Result.fail(400, "性别不能为空");
        }
        if (!StringUtils.hasText(req.getPassword())) {
            return Result.fail(400, "密码不能为空");
        }

        try {
            String userId = provisioner.provision(NewPersonSpec.builder()
                    .name(req.getName())
                    .mobilePhone(req.getMobilePhone())
                    .gender(req.getGender())
                    .jobNumber(req.getJobNumber())
                    .email(req.getEmail())
                    .username(username)
                    .rawPassword(req.getPassword())
                    .accountSource("OUTSIDER")
                    .idpUid(req.getIdpUid())
                    .build());
            User user = userMapper.findById(userId);
            if (user == null) {
                return Result.error("注册失败，请稍后重试");
            }
            user.setRole(authService.normalizeRole(user.getRole()));
            return authService.generateAuthResult(user);
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }
}
