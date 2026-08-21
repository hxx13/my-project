package com.example.demo.modules.nhp.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.nhp.entity.CrfRecord;
import com.example.demo.modules.nhp.entity.CrfRecordSnapshot;
import com.example.demo.modules.nhp.entity.CrfSignature;
import com.example.demo.modules.nhp.entity.CrfSubject;
import com.example.demo.modules.nhp.service.NhpRecordService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** NHP 数据采集（研究对象/表单实例/EAV 值/双录入/签名/快照）。 */
@RestController
@RequestMapping("/api/nhp")
@Tag(name = "NHP 数据采集", description = "研究对象 + 表单实例 + 字段值 EAV + 快照")
public class NhpRecordController {

    /** 与内容管理壳一致：删除/改身份标识需 ADMIN+。 */
    private static final RoleEnum DELETE_MIN_ROLE = RoleEnum.ADMIN;

    private final NhpRecordService service;
    private final AuthContextService authContextService;

    public NhpRecordController(NhpRecordService service, AuthContextService authContextService) {
        this.service = service;
        this.authContextService = authContextService;
    }

    private Result<?> requireMinRole(String authHeader, RoleEnum minRole) {
        User user = authContextService.resolveUserFromBearer(authHeader);
        if (user == null) {
            return Result.fail(401, "未登录或 Token 无效");
        }
        RoleEnum role = user.getRole() == null ? RoleEnum.MEMBER : user.getRole();
        if (role.getLevel() < minRole.getLevel()) {
            return Result.fail(403, "无权限：需要 " + minRole.getCode() + " 及以上");
        }
        return null;
    }

    @GetMapping("/subjects")
    @Operation(summary = "研究对象分页列表")
    public Result<Map<String, Object>> listSubjects(
            @RequestParam(required = false) String subjectType,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        return service.listSubjects(subjectType, status, q, page, size);
    }

    @GetMapping("/records")
    @Operation(summary = "表单实例分页列表（可浏览续填）")
    public Result<Map<String, Object>> listRecords(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Long subjectId,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        return service.listRecords(status, subjectId, q, page, size);
    }

    @PostMapping("/subjects")
    @Operation(summary = "创建研究对象（供体/受体）")
    public Result<CrfSubject> createSubject(@RequestBody Map<String, Object> body) {
        return service.createSubject(body);
    }

    @PutMapping("/subjects/{subjectId}")
    @Operation(summary = "更新研究对象（含身份标识字段）")
    public Result<?> updateSubject(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long subjectId,
            @RequestBody Map<String, Object> body) {
        Result<?> denied = requireMinRole(auth, DELETE_MIN_ROLE);
        if (denied != null) return denied;
        return service.updateSubject(subjectId, body);
    }

    @DeleteMapping("/subjects/{subjectId}")
    @Operation(summary = "软删除研究对象（RETIRED）；有实例时需 cascade=true")
    public Result<?> deleteSubject(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long subjectId,
            @RequestParam(defaultValue = "false") boolean cascade) {
        Result<?> denied = requireMinRole(auth, DELETE_MIN_ROLE);
        if (denied != null) return denied;
        return service.deleteSubject(subjectId, cascade);
    }

    @DeleteMapping("/records/{recordId}")
    @Operation(summary = "软删除表单实例（status=DELETED）")
    public Result<?> deleteRecord(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long recordId) {
        Result<?> denied = requireMinRole(auth, DELETE_MIN_ROLE);
        if (denied != null) return denied;
        return service.deleteRecord(recordId);
    }

    @PostMapping("/subjects/{subjectId}/records")
    @Operation(summary = "创建表单实例")
    public Result<CrfRecord> createRecord(@PathVariable Long subjectId, @RequestBody Map<String, Object> body) {
        return service.createRecord(subjectId, body);
    }

    @GetMapping("/records/{recordId}")
    @Operation(summary = "表单实例详情（含值与快照数）")
    public Result<Map<String, Object>> recordDetail(@PathVariable Long recordId) {
        return service.recordDetail(recordId);
    }

    @GetMapping("/records/{recordId}/values")
    @Operation(summary = "字段值 map（fieldCode→value）")
    public Result<Map<String, Object>> listValues(@PathVariable Long recordId) {
        return service.listValues(recordId);
    }

    @PutMapping("/records/{recordId}/values")
    @Operation(summary = "批量 upsert 字段值（EAV）")
    public Result<?> upsertValues(@PathVariable Long recordId, @RequestBody Map<String, Object> body) {
        Object values = body == null ? null : body.get("values");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> list = values instanceof List ? (List<Map<String, Object>>) values : null;
        String operatorId = body == null ? null : (String) body.get("operatorId");
        return service.upsertValues(recordId, list, operatorId);
    }

    @PutMapping("/records/{recordId}/status")
    @Operation(summary = "更新状态（COMPLETE/LOCKED 自动打快照）")
    public Result<CrfRecord> updateStatus(@PathVariable Long recordId, @RequestBody Map<String, Object> body) {
        return service.updateStatus(recordId, body);
    }

    @PostMapping("/records/{recordId}/snapshots")
    @Operation(summary = "手动创建不可变快照")
    public Result<CrfRecordSnapshot> createSnapshot(
            @PathVariable Long recordId, @RequestBody(required = false) Map<String, Object> body) {
        return service.createSnapshot(recordId, body);
    }

    @GetMapping("/records/{recordId}/snapshots")
    @Operation(summary = "快照列表（轻量，不含 data）")
    public Result<List<CrfRecordSnapshot>> listSnapshots(@PathVariable Long recordId) {
        return service.listSnapshots(recordId);
    }

    @GetMapping("/records/{recordId}/snapshots/{snapshotId}")
    @Operation(summary = "快照详情（含 data_json）")
    public Result<CrfRecordSnapshot> getSnapshot(@PathVariable Long recordId, @PathVariable Long snapshotId) {
        return service.getSnapshot(recordId, snapshotId);
    }

    @PostMapping("/records/{recordId}/snapshots/{snapshotId}/rollback")
    @Operation(summary = "回退到目标快照（覆盖当前 EAV，状态回 DRAFT，写审计）")
    public Result<Map<String, Object>> rollbackSnapshot(
            @PathVariable Long recordId,
            @PathVariable Long snapshotId,
            @RequestBody(required = false) Map<String, Object> body) {
        return service.rollbackSnapshot(recordId, snapshotId, body);
    }

    @PostMapping("/records/{recordId}/double-entry")
    @Operation(summary = "双录入二录（entry_pass=2）")
    public Result<?> doubleEntry(@PathVariable Long recordId, @RequestBody Map<String, Object> body) {
        return service.doubleEntry(recordId, body);
    }

    @GetMapping("/records/{recordId}/compare")
    @Operation(summary = "两录差异比对")
    public Result<?> compare(@PathVariable Long recordId) {
        return service.compare(recordId);
    }

    @GetMapping("/records/{recordId}/values/second")
    @Operation(summary = "二录字段值 map（fieldCode→value）")
    public Result<Map<String, Object>> listSecondValues(@PathVariable Long recordId) {
        return service.listValuesPass(recordId, 2);
    }

    @PostMapping("/records/{recordId}/sign")
    @Operation(summary = "电子签名")
    public Result<CrfSignature> sign(@PathVariable Long recordId, @RequestBody Map<String, Object> body) {
        return service.sign(recordId, body);
    }

    @GetMapping("/subjects/{subjectId}")
    @Operation(summary = "研究对象详情 + 记录树")
    public Result<Map<String, Object>> subjectDetail(@PathVariable Long subjectId) {
        return service.subjectDetail(subjectId);
    }
}
