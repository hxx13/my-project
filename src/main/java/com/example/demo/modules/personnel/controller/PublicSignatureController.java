package com.example.demo.modules.personnel.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.personnel.service.PersonnelSignatureService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 电子签名的**公开端点**（供手机扫码打开，无需登录）。
 *
 * <p>鉴权靠 path 里的 token 自己校验 —— 与 {@code /api/public/mobile-center/{token}} 同一套范式。
 * token 是一次性的，提交成功即失效。
 */
@RestController
@RequestMapping("/api/public/sign")
@Tag(name = "电子签名（公开）", description = "手机扫码打开签名面板")
public class PublicSignatureController {

    private final PersonnelSignatureService signatureService;

    public PublicSignatureController(PersonnelSignatureService signatureService) {
        this.signatureService = signatureService;
    }

    @GetMapping("/{token}")
    @Operation(summary = "链接信息（被签人姓名 + 是否仍有效）")
    public Result<?> info(@PathVariable String token) {
        try {
            return Result.success(signatureService.resolveLink(token));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/{token}")
    @Operation(summary = "提交签名（链接随即失效）")
    public Result<?> submit(@PathVariable String token, @RequestBody Map<String, Object> body) {
        try {
            Map<String, Object> info = signatureService.consumeLink(token,
                    body.get("imageData") == null ? null : String.valueOf(body.get("imageData")));
            return Result.success(Map.of("ok", true, "name", info.get("name") == null ? "" : info.get("name")));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }
}
