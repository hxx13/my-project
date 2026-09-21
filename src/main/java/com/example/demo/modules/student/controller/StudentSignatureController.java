package com.example.demo.modules.student.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.personnel.service.PersonnelSignatureService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 我的电子签名（学生端）。
 *
 * <p>签名一经提交**不可更改**：提交后这里只能读，改的唯一途径是管理员在人员授权页重置。
 */
@RestController
@RequestMapping("/api/student/signature")
@Tag(name = "电子签名", description = "个人电子签名（每人一份，不可更改）")
public class StudentSignatureController {

    private final AuthContextService authContextService;
    private final PersonnelSignatureService signatureService;

    public StudentSignatureController(AuthContextService authContextService,
                                      PersonnelSignatureService signatureService) {
        this.authContextService = authContextService;
        this.signatureService = signatureService;
    }

    private User resolveUser(String authorization) {
        return authContextService.resolveUserFromBearer(authorization);
    }

    @GetMapping
    @Operation(summary = "我的签名（未签则 hasSignature=false）")
    public Result<?> mine(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User u = resolveUser(authorization);
        if (u == null) return Result.fail(401, "未登录或令牌无效");
        try {
            return Result.success(signatureService.mySignature(u.getId()));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping
    @Operation(summary = "提交我的签名（已提交则拒绝）")
    public Result<?> submit(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @RequestBody Map<String, Object> body) {
        User u = resolveUser(authorization);
        if (u == null) return Result.fail(401, "未登录或令牌无效");
        try {
            signatureService.submitMine(u.getId(),
                    body.get("imageData") == null ? null : String.valueOf(body.get("imageData")), "WEB");
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
        return Result.success(Map.of("ok", true));
    }

    @PostMapping("/link")
    @Operation(summary = "生成限时一次性链接（用手机扫码画自己的签名）")
    public Result<?> createLink(@RequestHeader(value = "Authorization", required = false) String authorization,
                                @RequestBody(required = false) Map<String, Object> body) {
        User u = resolveUser(authorization);
        if (u == null) return Result.fail(401, "未登录或令牌无效");
        Integer ttl = null;
        if (body != null && body.get("ttlMinutes") instanceof Number n) {
            ttl = n.intValue();
        }
        try {
            return Result.success(signatureService.createLink(u.getId(), ttl));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }
}
