package com.example.demo.modules.nhp.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.nhp.entity.CrfMedication;
import com.example.demo.modules.nhp.mapper.CrfMedicationMapper;
import com.example.demo.modules.nhp.service.NhpIdService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** NHP 给药台账（crf_medication）：列表 + 创建（自动取号 MED）。 */
@RestController
@RequestMapping("/api/nhp")
@Tag(name = "NHP 给药台账", description = "crf_medication 实体 CRUD")
public class NhpMedicationController {

    private final CrfMedicationMapper medicationMapper;
    private final NhpIdService idService;

    public NhpMedicationController(CrfMedicationMapper medicationMapper, NhpIdService idService) {
        this.medicationMapper = medicationMapper;
        this.idService = idService;
    }

    @GetMapping("/medications")
    @Operation(summary = "给药列表")
    public Result<List<CrfMedication>> listMedications() {
        return Result.success(medicationMapper.list());
    }

    @PostMapping("/medications")
    @Operation(summary = "创建给药记录（自动取号 MED-...）")
    @Transactional
    public Result<CrfMedication> createMedication(@RequestBody Map<String, Object> body) {
        CrfMedication m = new CrfMedication();
        m.setRegimenId(asLong(body.get("regimenId")));
        m.setAnesthesiaId(asLong(body.get("anesthesiaId")));
        m.setDrugCode(str(body.get("drugCode")));
        m.setDoseValue(asDecimal(body.get("doseValue")));
        m.setDoseUnit(str(body.get("doseUnit")));
        m.setRoute(str(body.get("route")));
        m.setDoseTime(asDateTime(body.get("doseTime")));
        m.setMissedFlag(str(body.get("missedFlag")));
        m.setStatus(str(body.get("status")) == null ? "ACTIVE" : str(body.get("status")));

        String medCode = str(body.get("medCode"));
        if (medCode == null || medCode.isBlank()) {
            Map<String, Object> ctx = new LinkedHashMap<>();
            ctx.put("reg", m.getRegimenId());
            medCode = safeCode("MED", ctx);
        }
        m.setMedCode(medCode);
        medicationMapper.insert(m);
        return Result.success(m);
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

    private static BigDecimal asDecimal(Object v) {
        if (v == null) return null;
        if (v instanceof BigDecimal b) return b;
        if (v instanceof Number n) return BigDecimal.valueOf(n.doubleValue());
        try { return new BigDecimal(String.valueOf(v)); } catch (Exception e) { return null; }
    }

    private static LocalDateTime asDateTime(Object v) {
        if (v == null) return null;
        if (v instanceof LocalDateTime dt) return dt;
        try { return LocalDateTime.parse(String.valueOf(v).replace(' ', 'T')); } catch (Exception e) { return null; }
    }
}
