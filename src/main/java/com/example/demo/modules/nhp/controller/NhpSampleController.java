package com.example.demo.modules.nhp.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.nhp.entity.CrfSample;
import com.example.demo.modules.nhp.mapper.CrfSampleMapper;
import com.example.demo.modules.nhp.service.NhpIdService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** NHP 样本台账（crf_sample）：列表 + 创建（自动取号 SMP）。 */
@RestController
@RequestMapping("/api/nhp")
@Tag(name = "NHP 样本台账", description = "crf_sample 实体 CRUD")
public class NhpSampleController {

    private final CrfSampleMapper sampleMapper;
    private final NhpIdService idService;

    public NhpSampleController(CrfSampleMapper sampleMapper, NhpIdService idService) {
        this.sampleMapper = sampleMapper;
        this.idService = idService;
    }

    @GetMapping("/samples")
    @Operation(summary = "样本列表（可按研究对象过滤）")
    public Result<List<CrfSample>> listSamples(@RequestParam(required = false) Long subjectId) {
        if (subjectId != null) {
            return Result.success(sampleMapper.listBySubjectId(subjectId));
        }
        return Result.success(sampleMapper.list());
    }

    @PostMapping("/samples")
    @Operation(summary = "创建样本（自动取号 SMP-...）")
    @Transactional
    public Result<CrfSample> createSample(@RequestBody Map<String, Object> body) {
        CrfSample s = new CrfSample();
        s.setTxId(asLong(body.get("txId")));
        s.setDonorSubjectId(asLong(body.get("donorSubjectId")));
        s.setRecipientSubjectId(asLong(body.get("recipientSubjectId")));
        s.setSampleType(str(body.get("sampleType")));
        s.setTimepointCode(str(body.get("timepointCode")));
        s.setCollectDatetime(asDateTime(body.get("collectDatetime")));
        s.setStorageCondition(str(body.get("storageCondition")));
        s.setStorageLocation(str(body.get("storageLocation")));
        s.setStatus(str(body.get("status")) == null ? "ACTIVE" : str(body.get("status")));
        s.setActive(true);

        String sampleCode = str(body.get("sampleCode"));
        if (sampleCode == null || sampleCode.isBlank()) {
            Map<String, Object> ctx = new LinkedHashMap<>();
            ctx.put("tx", s.getTxId());
            ctx.put("tp", s.getTimepointCode());
            ctx.put("sampleType", s.getSampleType());
            sampleCode = safeCode("SMP", ctx);
        }
        s.setSampleCode(sampleCode);
        sampleMapper.insert(s);
        return Result.success(s);
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

    private static LocalDateTime asDateTime(Object v) {
        if (v == null) return null;
        if (v instanceof LocalDateTime dt) return dt;
        try { return LocalDateTime.parse(String.valueOf(v).replace(' ', 'T')); } catch (Exception e) { return null; }
    }
}
