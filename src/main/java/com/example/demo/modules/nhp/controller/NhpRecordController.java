package com.example.demo.modules.nhp.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.nhp.entity.CrfRecord;
import com.example.demo.modules.nhp.entity.CrfRecordSnapshot;
import com.example.demo.modules.nhp.entity.CrfTransplant;
import com.example.demo.modules.nhp.entity.CrfSignature;
import com.example.demo.modules.nhp.entity.CrfSubject;
import com.example.demo.modules.nhp.service.NhpAttachmentService;
import com.example.demo.modules.nhp.service.NhpPermissionService;
import com.example.demo.modules.nhp.service.NhpRecordService;
import com.example.demo.modules.team.service.TeamService;
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

    private final NhpRecordService service;
    private final NhpAttachmentService attachmentService;
    private final UploadFileService uploadFileService;
    private final AuthContextService authContextService;
    private final TeamService teamService;
    private final NhpPermissionService permissionService;

    public NhpRecordController(NhpRecordService service,
                               NhpAttachmentService attachmentService,
                               UploadFileService uploadFileService,
                               AuthContextService authContextService,
                               TeamService teamService,
                               NhpPermissionService permissionService) {
        this.service = service;
        this.attachmentService = attachmentService;
        this.uploadFileService = uploadFileService;
        this.authContextService = authContextService;
        this.teamService = teamService;
        this.permissionService = permissionService;
    }

    private Result<?> requireManagePerm(String auth, Long teamId, String ownerId) {
        User user = authContextService.resolveUserFromBearer(auth);
        if (user == null) {
            return Result.fail(401, "未登录或 Token 无效");
        }
        if (permissionService.isTeamOwner(user, teamId)) {
            return null;
        }
        if (ownerId != null && ownerId.equals(user.getId())) {
            return null;
        }
        return Result.fail(403, "无权限：需平台所有者/团队负责人/本人");
    }

    private void requireProjectRead(String auth, Long projectId) {
        User user = authContextService.resolveUserFromBearer(auth);
        if (user == null) {
            throw new TwinBusinessException(401, "未登录或 Token 无效");
        }
        if (!permissionService.isTeamMember(user, permissionService.teamIdOfProject(projectId))) {
            throw new TwinBusinessException(403, "无权限：非本团队成员");
        }
    }

    private void requireProjectManage(String auth, Long projectId) {
        User user = authContextService.resolveUserFromBearer(auth);
        if (user == null) {
            throw new TwinBusinessException(401, "未登录或 Token 无效");
        }
        if (!permissionService.canManageTeam(user, permissionService.teamIdOfProject(projectId))) {
            throw new TwinBusinessException(403, "无权限：需平台所有者/团队负责人/管理员");
        }
    }

    private void requireProjectOwner(String auth, Long projectId) {
        User user = authContextService.resolveUserFromBearer(auth);
        if (user == null) {
            throw new TwinBusinessException(401, "未登录或 Token 无效");
        }
        if (!permissionService.isTeamOwner(user, permissionService.teamIdOfProject(projectId))) {
            throw new TwinBusinessException(403, "无权限：需平台所有者/团队负责人");
        }
    }

    private void requireRecordRead(String auth, Long recordId) {
        User user = authContextService.resolveUserFromBearer(auth);
        if (user == null) {
            throw new TwinBusinessException(401, "未登录或 Token 无效");
        }
        if (!permissionService.hasRecordCapability(user, recordId, "crf:view")) {
            throw new TwinBusinessException(403, "无权限：角色无「查看」能力");
        }
        String formKey = permissionService.formKeyOfRecord(recordId);
        String owner = permissionService.createdByOfRecord(recordId);
        if (permissionService.canViewRecord(user, recordId, formKey, owner)) {
            return;
        }
        throw new TwinBusinessException(403, "无权限：表单权限不允许查看");
    }

    private void requireRecordEdit(String auth, Long recordId) {
        User user = authContextService.resolveUserFromBearer(auth);
        if (user == null) {
            throw new TwinBusinessException(401, "未登录或 Token 无效");
        }
        if (!permissionService.hasRecordCapability(user, recordId, "crf:edit")) {
            throw new TwinBusinessException(403, "无权限：角色无「编辑」能力");
        }
        String formKey = permissionService.formKeyOfRecord(recordId);
        String owner = permissionService.createdByOfRecord(recordId);
        if (permissionService.canEditRecord(user, recordId, formKey, owner)) {
            return;
        }
        throw new TwinBusinessException(403, "无权限：表单锁定或权限不允许编辑");
    }

    private void requireRecordFreeze(String auth, Long recordId) {
        User user = authContextService.resolveUserFromBearer(auth);
        if (user == null) {
            throw new TwinBusinessException(401, "未登录或 Token 无效");
        }
        if (!permissionService.hasRecordCapability(user, recordId, "crf:freeze")) {
            throw new TwinBusinessException(403, "无权限：角色无「冻结」能力");
        }
    }

    private void requireDelete(String auth, Long teamId) {
        User user = authContextService.resolveUserFromBearer(auth);
        if (user == null) {
            throw new TwinBusinessException(401, "未登录或 Token 无效");
        }
        if (!permissionService.hasCapability(user, teamId, "crf:delete")) {
            throw new TwinBusinessException(403, "无权限：角色无「删除」能力");
        }
    }

    @GetMapping("/subjects")
    @Operation(summary = "研究对象分页列表")
    public Result<Map<String, Object>> listSubjects(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam(required = false) String subjectType,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        return service.listSubjects(authContextService.resolveUserFromBearer(auth), subjectType, status, q, page, size);
    }

    @GetMapping("/records")
    @Operation(summary = "表单实例分页列表（可浏览续填）")
    public Result<Map<String, Object>> listRecords(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Long subjectId,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        return service.listRecords(authContextService.resolveUserFromBearer(auth), status, subjectId, q, page, size);
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
    @Operation(summary = "登记项目（自动归属到当前用户所在团队）")
    public Result<Map<String, Object>> createProject(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestBody Map<String, Object> body) {
        // 项目强制归属团队：未显式指定 teamId 时取当前用户第一个团队；无团队则拒绝创建
        if (body != null && (body.get("teamId") == null || String.valueOf(body.get("teamId")).isBlank())) {
            List<Long> myTeams = teamService.myTeamIds(authContextService.resolveUserFromBearer(auth));
            if (!myTeams.isEmpty()) {
                body.put("teamId", myTeams.get(0));
            } else {
                return Result.fail(400, "当前账号未加入任何团队，无法创建项目");
            }
        }
        return service.createProject(body);
    }

    @GetMapping("/projects")
    @Operation(summary = "项目管理：列出项目（mine=true 只列当前用户所在团队的项目）")
    public Result<List<Map<String, Object>>> listProjects(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam(value = "mine", required = false, defaultValue = "false") boolean mine) {
        List<Map<String, Object>> projects = service.listProjects();
        if (mine) {
            User u = authContextService.resolveUserFromBearer(auth);
            // 平台所有者全见；否则仅见本团队项目（无归属项目亦不外泄）
            if (u != null && !permissionService.isPlatformOwner(u)) {
                java.util.Set<Long> teamSet = new java.util.HashSet<>(teamService.myTeamIds(u));
                projects.removeIf(p -> {
                    Object tid = p.get("teamId");
                    return tid == null || !teamSet.contains(((Number) tid).longValue());
                });
            }
        }
        return Result.success(projects);
    }

    @GetMapping("/projects/{id}")
    @Operation(summary = "项目详情")
    public Result<?> getProject(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long id) {
        requireProjectRead(auth, id);
        return service.updateProject(id, null);
    }

    @PutMapping("/projects/{id}")
    @Operation(summary = "回填项目计划书字段（编号/名称/备注/团队/器官/术式/手术日/状态）")
    public Result<CrfTransplant> updateProject(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long id, @RequestBody Map<String, Object> body) {
        requireProjectManage(auth, id);
        return service.updateProject(id, body);
    }

    @DeleteMapping("/projects/{id}")
    @Operation(summary = "删除空项目（有表单实例则拒绝）")
    public Result<?> deleteProject(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long id) {
        requireProjectOwner(auth, id);
        requireDelete(auth, permissionService.teamIdOfProject(id));
        return service.deleteProject(id);
    }

    @PostMapping("/projects/{projectId}/records")
    @Operation(summary = "项目化建实例：为宿主表单建一条未绑定对象的记录（保存时才建研究对象）")
    public Result<CrfRecord> createRecordForProject(@PathVariable Long projectId, @RequestBody Map<String, Object> body) {
        return service.createRecordForProject(projectId, body);
    }

    @GetMapping("/projects/{projectId}/records")
    @Operation(summary = "项目名下全部表单实例")
    public Result<Map<String, Object>> listProjectRecords(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long projectId) {
        requireProjectRead(auth, projectId);
        return service.listProjectRecords(projectId);
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
        Result<?> denied = requireManagePerm(auth, permissionService.teamIdOfSubject(subjectId), null);
        if (denied != null) return denied;
        return service.updateSubject(subjectId, body);
    }

    @PostMapping("/subjects/{subjectId}/advance-stage")
    @Operation(summary = "推进研究对象生命周期阶段（SCREENING→MATCHING→POST_TX→ENDPOINT）")
    public Result<?> advanceStage(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long subjectId,
            @RequestBody Map<String, Object> body) {
        Result<?> denied = requireManagePerm(auth, permissionService.teamIdOfSubject(subjectId), null);
        if (denied != null) return denied;
        return service.advanceStage(subjectId, body);
    }

    @DeleteMapping("/subjects/{subjectId}")
    @Operation(summary = "软删除研究对象（RETIRED）；有实例时需 cascade=true")
    public Result<?> deleteSubject(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long subjectId,
            @RequestParam(defaultValue = "false") boolean cascade) {
        Result<?> denied = requireManagePerm(auth, permissionService.teamIdOfSubject(subjectId), null);
        if (denied != null) return denied;
        requireDelete(auth, permissionService.teamIdOfSubject(subjectId));
        return service.deleteSubject(subjectId, cascade);
    }

    @DeleteMapping("/records/{recordId}")
    @Operation(summary = "软删除表单实例（status=DELETED）")
    public Result<?> deleteRecord(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long recordId) {
        Result<?> denied = requireManagePerm(auth, permissionService.teamIdOfRecord(recordId), permissionService.createdByOfRecord(recordId));
        if (denied != null) return denied;
        requireDelete(auth, permissionService.teamIdOfRecord(recordId));
        return service.deleteRecord(recordId);
    }

    @PostMapping("/subjects/{subjectId}/records")
    @Operation(summary = "创建表单实例")
    public Result<CrfRecord> createRecord(@PathVariable Long subjectId, @RequestBody Map<String, Object> body) {
        return service.createRecord(subjectId, body);
    }

    @GetMapping("/records/{recordId}")
    @Operation(summary = "表单实例详情（含值与快照数）")
    public Result<Map<String, Object>> recordDetail(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long recordId) {
        requireRecordRead(auth, recordId);
        return service.recordDetail(recordId);
    }

    @GetMapping("/records/{recordId}/values")
    @Operation(summary = "字段值 map（fieldCode→value）")
    public Result<Map<String, Object>> listValues(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long recordId) {
        requireRecordRead(auth, recordId);
        return service.listValues(recordId);
    }

    @PutMapping("/records/{recordId}/values")
    @Operation(summary = "批量 upsert 字段值（EAV）")
    public Result<?> upsertValues(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long recordId, @RequestBody Map<String, Object> body) {
        requireRecordEdit(auth, recordId);
        Object values = body == null ? null : body.get("values");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> list = values instanceof List ? (List<Map<String, Object>>) values : null;
        String operatorId = body == null ? null : (String) body.get("operatorId");
        return service.upsertValues(recordId, list, operatorId);
    }

    @PutMapping("/records/{recordId}/status")
    @Operation(summary = "更新状态（COMPLETE/LOCKED 自动打快照）")
    public Result<CrfRecord> updateStatus(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long recordId, @RequestBody Map<String, Object> body) {
        requireRecordFreeze(auth, recordId);
        return service.updateStatus(recordId, body);
    }

    @PostMapping("/records/{recordId}/snapshots")
    @Operation(summary = "手动创建不可变快照")
    public Result<CrfRecordSnapshot> createSnapshot(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long recordId, @RequestBody(required = false) Map<String, Object> body) {
        requireRecordEdit(auth, recordId);
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
