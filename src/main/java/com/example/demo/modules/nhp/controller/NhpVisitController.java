package com.example.demo.modules.nhp.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.nhp.entity.CrfProjectVisitPlan;
import com.example.demo.modules.nhp.entity.CrfTransplant;
import com.example.demo.modules.nhp.entity.CrfVisit;
import com.example.demo.modules.nhp.entity.CrfVisitPlan;
import com.example.demo.modules.nhp.entity.CrfVisitScheme;
import com.example.demo.modules.nhp.mapper.CrfTransplantMapper;
import com.example.demo.modules.nhp.mapper.CrfVisitMapper;
import com.example.demo.modules.nhp.mapper.CrfVisitSchemeMapper;
import com.example.demo.modules.nhp.service.NhpPermissionService;
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
    private final CrfVisitSchemeMapper visitSchemeMapper;
    private final CrfTransplantMapper transplantMapper;
    private final NhpVisitService visitService;
    private final AuthContextService authContextService;
    private final NhpPermissionService permissionService;

    public NhpVisitController(CrfVisitMapper visitMapper,
                              CrfVisitSchemeMapper visitSchemeMapper,
                              CrfTransplantMapper transplantMapper,
                              NhpVisitService visitService,
                              AuthContextService authContextService,
                              NhpPermissionService permissionService) {
        this.visitMapper = visitMapper;
        this.visitSchemeMapper = visitSchemeMapper;
        this.transplantMapper = transplantMapper;
        this.visitService = visitService;
        this.authContextService = authContextService;
        this.permissionService = permissionService;
    }

    /** 配置写守卫：默认访视方案/时点/编排仅平台所有者（团队方案待 Phase 5）。 */
    private void requirePlatformOwner(String auth) {
        User user = authContextService.resolveUserFromBearer(auth);
        if (user == null) {
            throw new TwinBusinessException(401, "未登录或 Token 无效");
        }
        if (!permissionService.isPlatformOwner(user)) {
            throw new TwinBusinessException(403, "无权限：需平台所有者");
        }
    }

    @GetMapping("/visits")
    @Operation(summary = "访视时点列表（schemeId 空=默认方案，否则按方案）")
    public Result<List<CrfVisit>> listVisits(@RequestParam(required = false) Long schemeId) {
        return Result.success(visitMapper.listBySchemeId(schemeId));
    }

    @PostMapping("/visits")
    @Operation(summary = "新建访视时点（可归属某方案）")
    public Result<CrfVisit> createVisit(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestBody Map<String, Object> body) {
        requirePlatformOwner(auth);
        String code = str(body.get("code"));
        if (code == null || code.isBlank()) {
            return Result.fail(400, "TP 码不能为空");
        }
        CrfVisit v = new CrfVisit();
        v.setSchemeId(asLong(body.get("schemeId")));
        v.setCode(code.trim());
        v.setName(str(body.get("name")));
        v.setSeq(asInt(body.get("seq")));
        Boolean repeating = asBool(body.get("repeating"));
        v.setRepeating(repeating == null ? Boolean.FALSE : repeating);
        v.setPlannedDays(asInt(body.get("plannedDays")));
        v.setEarlyDays(asInt(body.get("earlyDays")));
        v.setLateDays(asInt(body.get("lateDays")));
        v.setEndDays(asInt(body.get("endDays")));
        v.setEventAnchor(str(body.get("eventAnchor")));
        v.setActive(true);
        visitMapper.insert(v);
        return Result.success(visitMapper.findById(v.getId()));
    }

    @DeleteMapping("/visits/{id}")
    @Operation(summary = "删除访视时点（软删 + 同方案剩余时点按 seq 顺排重编号 TP00..TPN）")
    @Transactional
    public Result<?> deleteVisit(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long id) {
        requirePlatformOwner(auth);
        CrfVisit v = visitMapper.findById(id);
        if (v == null) return Result.fail(404, "访视不存在");
        Long schemeId = v.getSchemeId();
        visitMapper.softDelete(id);
        // TP 码仅是序号：删除后同方案剩余时点顺排重编号，避免留空档
        List<CrfVisit> rest = visitMapper.listBySchemeId(schemeId);
        for (int i = 0; i < rest.size(); i++) {
            String code = "TP" + String.format("%02d", i + 1);
            CrfVisit r = rest.get(i);
            if (r.getCode() == null || !code.equals(r.getCode())) {
                visitMapper.updateCode(r.getId(), code);
            }
        }
        return Result.success();
    }

    @GetMapping("/visit-schemes")
    @Operation(summary = "访视方案列表")
    public Result<List<CrfVisitScheme>> listSchemes() {
        return Result.success(visitSchemeMapper.list());
    }

    @PostMapping("/visit-schemes")
    @Operation(summary = "新建访视方案（以默认方案为底版克隆时点）")
    @Transactional
    public Result<CrfVisitScheme> createScheme(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestBody Map<String, Object> body) {
        requirePlatformOwner(auth);
        String name = str(body.get("name"));
        if (name == null || name.isBlank()) {
            return Result.fail(400, "方案名不能为空");
        }
        if (visitSchemeMapper.findByName(name.trim()) != null) {
            return Result.fail(409, "方案名已存在: " + name.trim());
        }
        CrfVisitScheme s = new CrfVisitScheme();
        s.setName(name.trim());
        s.setDescription(str(body.get("description")));
        s.setActive(true);
        visitSchemeMapper.insert(s);
        // 以默认方案（scheme_id IS NULL）为底版克隆一份时点，用户再自由修改
        List<CrfVisit> defaults = visitMapper.listBySchemeId(null);
        for (CrfVisit d : defaults) {
            CrfVisit copy = new CrfVisit();
            copy.setSchemeId(s.getId());
            copy.setCode(d.getCode());
            copy.setName(d.getName());
            copy.setSeq(d.getSeq());
            copy.setRepeating(d.getRepeating());
            copy.setPlannedDays(d.getPlannedDays());
            copy.setEarlyDays(d.getEarlyDays());
            copy.setLateDays(d.getLateDays());
            copy.setEndDays(d.getEndDays());
            copy.setEventAnchor(d.getEventAnchor());
            copy.setActive(true);
            visitMapper.insert(copy);
        }
        return Result.success(visitSchemeMapper.findById(s.getId()));
    }

    @PutMapping("/visit-schemes/{id}")
    @Operation(summary = "重命名访视方案")
    public Result<CrfVisitScheme> updateScheme(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long id, @RequestBody Map<String, Object> body) {
        requirePlatformOwner(auth);
        CrfVisitScheme s = visitSchemeMapper.findById(id);
        if (s == null) return Result.fail(404, "方案不存在");
        String name = str(body.get("name"));
        if (name != null && !name.isBlank()) s.setName(name.trim());
        if (body.containsKey("description")) s.setDescription(str(body.get("description")));
        visitSchemeMapper.update(s);
        return Result.success(visitSchemeMapper.findById(id));
    }

    @DeleteMapping("/visit-schemes/{id}")
    @Operation(summary = "删除访视方案（级联：软删方案 + 其下时点 + 解除项目引用回退默认）")
    @Transactional
    public Result<?> deleteScheme(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long id) {
        requirePlatformOwner(auth);
        CrfVisitScheme s = visitSchemeMapper.findById(id);
        if (s == null) return Result.fail(404, "方案不存在");
        visitMapper.softDeleteByScheme(id);
        visitSchemeMapper.unsetProjectsByScheme(id);
        visitSchemeMapper.softDelete(id);
        return Result.success();
    }

    @GetMapping("/projects/{projectId}/visit-scheme")
    @Operation(summary = "项目选用的访视方案 id")
    public Result<Long> getProjectVisitScheme(@PathVariable Long projectId) {
        CrfTransplant tx = transplantMapper.findById(projectId);
        return Result.success(tx == null ? null : tx.getVisitSchemeId());
    }

    @PutMapping("/projects/{projectId}/visit-scheme")
    @Operation(summary = "项目选用访视方案（body.visitSchemeId 空=默认）")
    public Result<CrfTransplant> setProjectVisitScheme(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long projectId, @RequestBody Map<String, Object> body) {
        requirePlatformOwner(auth);
        CrfTransplant tx = transplantMapper.findById(projectId);
        if (tx == null) return Result.fail(404, "项目不存在");
        tx.setVisitSchemeId(asLong(body == null ? null : body.get("visitSchemeId")));
        transplantMapper.update(tx);
        return Result.success(transplantMapper.findById(projectId));
    }

    @PutMapping("/visits/{id}")
    @Operation(summary = "更新访视行（eventAnchor/窗口天数等）")
    @Transactional
    public Result<CrfVisit> updateVisit(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long id, @RequestBody Map<String, Object> patch) {
        requirePlatformOwner(auth);
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
    public Result<List<CrfVisitPlan>> replaceVisitPlan(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long visitId,
            @RequestBody List<Map<String, Object>> atoms) {
        requirePlatformOwner(auth);
        return Result.success(visitService.replaceVisitPlan(visitId, atoms));
    }

    @GetMapping("/projects/{projectId}/visit-plans")
    @Operation(summary = "项目级编排：该项目全部 TP 的表单指派（未配置即空）")
    public Result<List<CrfProjectVisitPlan>> listProjectVisitPlans(@PathVariable Long projectId) {
        return Result.success(visitService.listProjectVisitPlans(projectId));
    }

    @PutMapping("/projects/{projectId}/visits/{visitId}/plan")
    @Operation(summary = "项目级编排：整体替换该项目某 TP 的表单指派")
    public Result<List<CrfProjectVisitPlan>> replaceProjectVisitPlan(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long projectId,
            @PathVariable Long visitId,
            @RequestBody List<Map<String, Object>> atoms) {
        requirePlatformOwner(auth);
        return Result.success(visitService.replaceProjectVisitPlan(projectId, visitId, atoms));
    }

    private static Integer asInt(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.intValue();
        String s = String.valueOf(v).trim();
        if (s.isEmpty() || "null".equalsIgnoreCase(s)) return null;
        return Integer.parseInt(s);
    }

    private static Long asLong(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        String s = String.valueOf(v).trim();
        if (s.isEmpty() || "null".equalsIgnoreCase(s)) return null;
        return Long.parseLong(s);
    }

    private static String str(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private static Boolean asBool(Object v) {
        if (v == null) return null;
        if (v instanceof Boolean b) return b;
        if (v instanceof Number n) return n.intValue() != 0;
        return Boolean.parseBoolean(String.valueOf(v));
    }
}
