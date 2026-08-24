package com.example.demo.modules.nhp.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.nhp.entity.CrfRecord;
import com.example.demo.modules.nhp.entity.CrfRecordSnapshot;
import com.example.demo.modules.nhp.entity.CrfSignature;
import com.example.demo.modules.nhp.entity.CrfSubject;
import com.example.demo.modules.nhp.service.NhpAttachmentService;
import com.example.demo.modules.nhp.service.NhpRecordService;
import com.example.demo.modules.upload.entity.UploadFileRecord;
import com.example.demo.modules.upload.service.UploadFileService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
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
    private final NhpAttachmentService attachmentService;
    private final UploadFileService uploadFileService;
    private final AuthContextService authContextService;

    public NhpRecordController(NhpRecordService service,
                               NhpAttachmentService attachmentService,
                               UploadFileService uploadFileService,
                               AuthContextService authContextService) {
        this.service = service;
        this.attachmentService = attachmentService;
        this.uploadFileService = uploadFileService;
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

    @PostMapping("/subjects/placeholder")
    @Operation(summary = "创建占位研究对象（表单化登记第一步；subjectCode 为 PEND- 临时号）")
    public Result<CrfSubject> createPlaceholderSubject(@RequestBody Map<String, Object> body) {
        return service.createPlaceholderSubject(body);
    }

    @PostMapping("/subjects/{subjectId}/finalize")
    @Operation(summary = "回填研究对象（表单化登记第二步；分配真实 DON/RCP 编号并同步身份字段）")
    public Result<CrfSubject> finalizeSubject(@PathVariable Long subjectId, @RequestBody Map<String, Object> body) {
        return service.finalizeSubject(subjectId, body);
    }

    @PostMapping("/projects")
    @Operation(summary = "登记项目（crf_transplant 为顶层：建项目 + 供体/受体占位对象）")
    public Result<Map<String, Object>> createProject(@RequestBody Map<String, Object> body) {
        return service.createProject(body);
    }

    @GetMapping("/projects")
    @Operation(summary = "项目管理：列出全部项目（含供体/受体对象）")
    public Result<List<Map<String, Object>>> listProjects() {
        return Result.success(service.listProjects());
    }

    @PostMapping("/projects/{projectId}/records")
    @Operation(summary = "项目化建实例：为宿主表单建一条未绑定对象的记录（保存时才建研究对象）")
    public Result<CrfRecord> createRecordForProject(@PathVariable Long projectId, @RequestBody Map<String, Object> body) {
        return service.createRecordForProject(projectId, body);
    }

    @PostMapping("/records/{recordId}/ensure-subject")
    @Operation(summary = "按需创建研究对象：记录尚无对象时据 hostType 建供体/受体对象并回链")
    public Result<CrfSubject> ensureSubject(@PathVariable Long recordId) {
        return service.ensureSubjectForRecord(recordId);
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

    @PostMapping("/subjects/{subjectId}/advance-stage")
    @Operation(summary = "推进研究对象生命周期阶段（SCREENING→MATCHING→POST_TX→ENDPOINT）")
    public Result<?> advanceStage(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long subjectId,
            @RequestBody Map<String, Object> body) {
        Result<?> denied = requireMinRole(auth, DELETE_MIN_ROLE);
        if (denied != null) return denied;
        return service.advanceStage(subjectId, body);
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

    @PostMapping("/records/{recordId}/attachments")
    @Operation(summary = "上传附件")
    public Result<?> uploadAttachment(@PathVariable Long recordId,
                                      @RequestParam("file") MultipartFile file,
                                      @RequestParam(value = "operatorId", required = false) String operatorId) {
        return attachmentService.upload(recordId, file, operatorId);
    }

    @GetMapping("/records/{recordId}/attachments")
    @Operation(summary = "附件列表")
    public Result<?> listAttachments(@PathVariable Long recordId) {
        return attachmentService.list(recordId);
    }

    @GetMapping("/attachments/{fileId}/download")
    @Operation(summary = "下载附件")
    public ResponseEntity<Resource> downloadAttachment(@PathVariable Long fileId) {
        UploadFileRecord record = attachmentService.resolveDownload(fileId);
        File file = uploadFileService.resolveBaseDir().resolve(record.getStorageKey()).normalize().toFile();
        if (!file.exists() || !file.isFile()) {
            return ResponseEntity.notFound().build();
        }
        String safeName = StringUtils.hasText(record.getOriginalName()) ? record.getOriginalName() : file.getName();
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header("Content-Disposition", "attachment; filename=\"" + safeName.replace("\"", "") + "\"")
                .body(new FileSystemResource(file));
    }

    @DeleteMapping("/records/{recordId}/attachments/{fileId}")
    @Operation(summary = "删除附件")
    public Result<?> deleteAttachment(@PathVariable Long recordId, @PathVariable Long fileId) {
        return attachmentService.delete(recordId, fileId);
    }

    @GetMapping("/subjects/{subjectId}")
    @Operation(summary = "研究对象详情 + 记录树")
    public Result<Map<String, Object>> subjectDetail(@PathVariable Long subjectId) {
        return service.subjectDetail(subjectId);
    }
}
