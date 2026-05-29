package com.example.demo.modules.student.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.student.dto.StudentRegisterRequest;
import com.example.demo.modules.student.dto.StudentQrVerifyResponse;
import com.example.demo.modules.student.service.StudentRegistrationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/auth/register/student")
@Tag(name = "学生认证", description = "学生端注册与 QR 验证")
public class StudentAuthController {

    private final StudentRegistrationService studentRegistrationService;

    public StudentAuthController(StudentRegistrationService studentRegistrationService) {
        this.studentRegistrationService = studentRegistrationService;
    }

    @PostMapping("/verify-qr")
    @Operation(summary = "上传QR码图片，解码并匹配人员库")
    public Result<StudentQrVerifyResponse> verifyQr(@RequestParam("file") MultipartFile file) {
        if (file == null || file.isEmpty()) {
            return Result.error("请上传二维码图片");
        }
        StudentQrVerifyResponse result = studentRegistrationService.verifyQrAndMatchPersonnel(file);
        return Result.success(result);
    }

    @PostMapping
    @Operation(summary = "学生注册（免邀请码）")
    public Result<?> register(@RequestBody StudentRegisterRequest request) {
        return studentRegistrationService.register(request);
    }
}
