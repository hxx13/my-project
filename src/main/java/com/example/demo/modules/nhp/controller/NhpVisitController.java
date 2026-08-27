package com.example.demo.modules.nhp.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.nhp.entity.CrfProjectVisitPlan;
import com.example.demo.modules.nhp.entity.CrfVisit;
import com.example.demo.modules.nhp.entity.CrfVisitPlan;
import com.example.demo.modules.nhp.mapper.CrfVisitMapper;
import com.example.demo.modules.nhp.service.NhpVisitService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** NHP 访视时点 + 访视编排（visit_plan）。 */
@RestController
@RequestMapping("/api/nhp")
@Tag(name = "NHP 访视时点", description = "crf_visit + crf_visit_plan")
public class NhpVisitController {

    private final CrfVisitMapper visitMapper;
    private final NhpVisitService visitService;

    public NhpVisitController(CrfVisitMapper visitMapper,
                              NhpVisitService visitService) {
        this.visitMapper = visitMapper;
        this.visitService = visitService;
    }

    @GetMapping("/visits")
    @Operation(summary = "访视时点列表（TP01~TP12）")
    public Result<List<CrfVisit>> listVisits() {
        return Result.success(visitMapper.list());
    }

    @PutMapping("/visits/{id}")
    @Operation(summary = "更新访视行（eventAnchor/窗口天数等）")
    @Transactional
    public Result<CrfVisit> updateVisit(@PathVariable Long id, @RequestBody Map<String, Object> patch) {
        CrfVisit row = visitMapper.findById(id);
        if (row == null) {
            return Result.fail(404, "访视不存在");
        }
        if (patch.containsKey("code") && patch.get("code") != null) {
            row.setCode(String.valueOf(patch.get("code")).trim());
        }
        if (patch.containsKey("name") && patch.get("name") != null) {
            row.setName(String.valueOf(patch.get("name")).trim());
        }
        if (patch.containsKey("eventAnchor")) {
            Object v = patch.get("eventAnchor");
            row.setEventAnchor(v == null || String.valueOf(v).isBlank() ? null : String.valueOf(v).trim());
        }
        if (patch.containsKey("plannedDays")) row.setPlannedDays(asInt(patch.get("plannedDays")));
        if (patch.containsKey("earlyDays")) row.setEarlyDays(asInt(patch.get("earlyDays")));
        if (patch.containsKey("lateDays")) row.setLateDays(asInt(patch.get("lateDays")));
        if (patch.containsKey("endDays")) row.setEndDays(asInt(patch.get("endDays")));
        if (patch.containsKey("seq")) row.setSeq(asInt(patch.get("seq")));
        if (patch.containsKey("repeating")) row.setRepeating(asBool(patch.get("repeating")));
        if (patch.containsKey("active")) row.setActive(asBool(patch.get("active")));
        visitMapper.update(row);
        return Result.success(visitMapper.findById(id));
    }

    @GetMapping("/visits/{visitId}/plan")
    @Operation(summary = "访视应采集的原子清单（crf_visit_plan）")
    public Result<List<CrfVisitPlan>> listVisitPlan(@PathVariable Long visitId) {
        return Result.success(visitService.listAtomsForVisit(visitId));
    }

    @GetMapping("/visits/plans")
    @Operation(summary = "全部访视编排（事件→指派表单，采集侧用）")
    public Result<List<CrfVisitPlan>> listVisitPlans() {
        return Result.success(visitService.listAllVisitPlans());
    }

    @PutMapping("/visits/{visitId}/plan")
    @Operation(summary = "整体替换访视原子清单（表单-事件指派）")
    public Result<List<CrfVisitPlan>> replaceVisitPlan(@PathVariable Long visitId,
                                                       @RequestBody List<Map<String, Object>> atoms) {
        return Result.success(visitService.replaceVisitPlan(visitId, atoms));
    }

    @GetMapping("/projects/{projectId}/visit-plans")
    @Operation(summary = "项目级编排：该项目全部 TP 的表单指派（未配置即空）")
    public Result<List<CrfProjectVisitPlan>> listProjectVisitPlans(@PathVariable Long projectId) {
        return Result.success(visitService.listProjectVisitPlans(projectId));
    }

    @PutMapping("/projects/{projectId}/visits/{visitId}/plan")
    @Operation(summary = "项目级编排：整体替换该项目某 TP 的表单指派")
    public Result<List<CrfProjectVisitPlan>> replaceProjectVisitPlan(@PathVariable Long projectId,
                                                                     @PathVariable Long visitId,
                                                                     @RequestBody List<Map<String, Object>> atoms) {
        return Result.success(visitService.replaceProjectVisitPlan(projectId, visitId, atoms));
    }

    private static Integer asInt(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.intValue();
        String s = String.valueOf(v).trim();
        if (s.isEmpty() || "null".equalsIgnoreCase(s)) return null;
        return Integer.parseInt(s);
    }

    private static Boolean asBool(Object v) {
        if (v == null) return null;
        if (v instanceof Boolean b) return b;
        if (v instanceof Number n) return n.intValue() != 0;
        return Boolean.parseBoolean(String.valueOf(v));
    }
}
