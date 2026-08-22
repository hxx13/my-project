package com.example.demo.modules.nhp.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.nhp.entity.CrfAdverseEvent;
import com.example.demo.modules.nhp.mapper.CrfAdverseEventMapper;
import com.example.demo.modules.nhp.service.NhpIdService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** NHP 不良事件台账（crf_adverse_event）：列表 + 创建（自动取号 AE）。 */
@RestController
@RequestMapping("/api/nhp")
@Tag(name = "NHP 不良事件台账", description = "crf_adverse_event 实体 CRUD")
public class NhpAdverseEventController {

    private final CrfAdverseEventMapper aeMapper;
    private final NhpIdService idService;

    public NhpAdverseEventController(CrfAdverseEventMapper aeMapper, NhpIdService idService) {
        this.aeMapper = aeMapper;
        this.idService = idService;
    }

    @GetMapping("/adverse-events")
    @Operation(summary = "不良事件列表（可按移植事件过滤）")
    public Result<List<CrfAdverseEvent>> listAes(@RequestParam(required = false) Long txId) {
        if (txId != null) {
            return Result.success(aeMapper.listByTxId(txId));
        }
        return Result.success(aeMapper.list());
    }

    @PostMapping("/adverse-events")
    @Operation(summary = "创建不良事件（自动取号 AE-...）")
    @Transactional
    public Result<CrfAdverseEvent> createAe(@RequestBody Map<String, Object> body) {
        CrfAdverseEvent a = new CrfAdverseEvent();
        a.setTxId(asLong(body.get("txId")));
        a.setAeType(str(body.get("aeType")));
        a.setAeGrade(str(body.get("aeGrade")));
        a.setRejectionRef(asLong(body.get("rejectionRef")));
        a.setBiopsySampleId(asLong(body.get("biopsySampleId")));
        a.setIntervention(str(body.get("intervention")));
        a.setAeOutcome(str(body.get("aeOutcome")));
        a.setStatus(str(body.get("status")) == null ? "ACTIVE" : str(body.get("status")));

        String aeCode = str(body.get("aeCode"));
        if (aeCode == null || aeCode.isBlank()) {
            Map<String, Object> ctx = new LinkedHashMap<>();
            ctx.put("tx", a.getTxId());
            aeCode = safeCode("AE", ctx);
        }
        a.setAeCode(aeCode);
        aeMapper.insert(a);
        return Result.success(a);
    }

    private String safeCode(String idType, Map<String, Object> ctx) {
        try {
            return idService.buildCode(idType, ctx);
        } catch (Exception e) {
            return idType + "-" + System.currentTimeMillis();
        }
    }

    private static String str(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private static Long asLong(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        try { return Long.parseLong(String.valueOf(v)); } catch (Exception e) { return null; }
    }
}
