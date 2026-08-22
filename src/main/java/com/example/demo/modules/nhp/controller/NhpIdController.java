package com.example.demo.modules.nhp.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.nhp.service.NhpIdService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

/** NHP ID 编码取号。 */
@RestController
@RequestMapping("/api/nhp/ids")
@Tag(name = "NHP ID 编码", description = "16 类 ID 原子取号（scope_key 泛化）")
public class NhpIdController {

    private final NhpIdService service;

    public NhpIdController(NhpIdService service) {
        this.service = service;
    }

    @PostMapping("/next")
    @Operation(summary = "原子取号（DON/RCP/XM/TX/SMP…，按 scope_key 递增）")
    public Result<Map<String, Object>> next(@RequestBody Map<String, Object> body) {
        String idType = str(body.get("idType"));
        if (idType == null) {
            return Result.fail(400, "idType 必填");
        }
        try {
            // body 即 ctx：center/base/tx/tp/date/lab… 由调用方按 ID 类型传入
            Map<String, Object> ctx = body == null ? Map.of() : new LinkedHashMap<>(body);
            String code = service.buildCode(idType, ctx);
            return Result.success(idResult(idType, ctx, code, false));
        } catch (IllegalArgumentException ex) {
            return Result.fail(400, ex.getMessage());
        }
    }

    @PostMapping("/preview")
    @Operation(summary = "预览下一编号（不递增、不持久化）")
    public Result<Map<String, Object>> preview(@RequestBody Map<String, Object> body) {
        String idType = str(body.get("idType"));
        if (idType == null) {
            return Result.fail(400, "idType 必填");
        }
        try {
            Map<String, Object> ctx = body == null ? Map.of() : new LinkedHashMap<>(body);
            String code = service.previewCode(idType, ctx);
            return Result.success(idResult(idType, ctx, code, true));
        } catch (IllegalArgumentException ex) {
            return Result.fail(400, ex.getMessage());
        }
    }

    private Map<String, Object> idResult(String idType, Map<String, Object> ctx, String code, boolean preview) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("idType", idType);
        out.put("scopeKey", service.buildScopeKey(idType, ctx));
        out.put("code", code);
        out.put("ctx", ctx);
        out.put("preview", preview);
        return out;
    }

    private String str(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }
}
