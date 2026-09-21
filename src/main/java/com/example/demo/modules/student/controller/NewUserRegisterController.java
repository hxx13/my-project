package com.example.demo.modules.student.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.student.dto.NewUserRegisterRequest;
import com.example.demo.modules.student.service.NewUserRegistrationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth/register")
@Tag(name = "新人员注册", description = "全新用户注册（受 app.registration.open 总闸门控制）")
public class NewUserRegisterController {

    private final NewUserRegistrationService newUserRegistrationService;

    public NewUserRegisterController(NewUserRegistrationService newUserRegistrationService) {
        this.newUserRegistrationService = newUserRegistrationService;
    }

    @PostMapping("/new")
    @Operation(summary = "全新用户注册（姓名/手机号/性别/密码必填）")
    public Result<?> register(@RequestBody NewUserRegisterRequest request) {
        return newUserRegistrationService.register(request);
    }
}
