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
@Tag(name = "NHP ID 编码", description = "16 类 ID 原子取号")
public class NhpIdController {

    private final NhpIdService service;

    public NhpIdController(NhpIdService service) {
        this.service = service;
    }

    @PostMapping("/next")
    @Operation(summary = "原子取号（DON/RCP/XM/TX/SMP…，crf_sequence 原子递增）")
    public Result<Map<String, Object>> next(@RequestBody Map<String, Object> body) {
        String idType = str(body.get("idType"));
        String centerCode = str(body.get("centerCode"));
        Integer year = body.get("year") instanceof Number n ? n.intValue() : null;
        long seq = service.next(idType, centerCode, year);
        String code = service.buildCode(idType, centerCode, year, seq);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("idType", idType);
        out.put("centerCode", centerCode);
        out.put("year", year);
        out.put("seq", seq);
        out.put("code", code);
        return Result.success(out);
    }

    private String str(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }
}
