package com.example.demo.modules.aup.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.aup.dto.AupBatchDeleteRequest;
import com.example.demo.modules.aup.dto.AupCreateRequest;
import com.example.demo.modules.aup.dto.AupDetailVO;
import com.example.demo.modules.aup.dto.AupSaveRequest;
import com.example.demo.modules.aup.dto.AupValidationErrorDTO;
import com.example.demo.modules.aup.dto.SignatureContextVO;
import com.example.demo.modules.aup.entity.AupRecord;
import com.example.demo.modules.aup.service.AupAccessPolicy;
import com.example.demo.modules.aup.service.AupAroSyncService;
import com.example.demo.modules.aup.service.AupService;
import com.example.demo.modules.upload.entity.UploadFileRecord;
import com.example.demo.modules.upload.service.UploadFileService;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * AUP 计划书主链路 REST 端点（§5.1 / §5.5 / §5.6）。
 * 端点由 WebMvcConfig 中 /api/aup/** 拦截器统一校验登录（401），越权在 Service 二次校验（403）。
 */
@RestController
@RequestMapping("/api/aup")
public class AupController {

    private final AuthContextService authContextService;
    private final AupService aupService;
    private final UploadFileService uploadFileService;
    private final AupAccessPolicy accessPolicy;
    private final AupAroSyncService aupAroSyncService;

    public AupController(AuthContextService authContextService,
                         AupService aupService,
                         UploadFileService uploadFileService,
                         AupAccessPolicy accessPolicy,
                         AupAroSyncService aupAroSyncService) {
        this.authContextService = authContextService;
        this.aupService = aupService;
        this.uploadFileService = uploadFileService;
        this.accessPolicy = accessPolicy;
        this.aupAroSyncService = aupAroSyncService;
    }

    // ---- 计划书 ----

    @GetMapping("/list")
    public Result<?> list(@RequestHeader(value = "Authorization", required = false) String authorization,
                          @RequestParam(defaultValue = "1") int page,
                          @RequestParam(defaultValue = "20") int size,
                          @RequestParam(required = false) String keyword,
                          @RequestParam(required = false) String registerNo,
                          @RequestParam(required = false) String stage,
                          @RequestParam(required = false) String excludeStage,
                          @RequestParam(required = false) String excludeStages,
                          @RequestParam(required = false) String projectGroupName,
                          @RequestParam(required = false) String dept,
                          @RequestParam(defaultValue = "false") boolean excludeDraft,
                          @RequestParam(required = false) String draftSource,
                          @RequestParam(required = false) Integer roundNo,
                          @RequestParam(required = false) String submitterId,
                          @RequestParam(required = false) String reviewerId,
                          @RequestParam(required = false) String submitterName,
                          @RequestParam(required = false) String reviewerName,
                          @RequestParam(defaultValue = "false") boolean relatedToMe,
                          @RequestParam(defaultValue = "false") boolean groupScopeOnly,
                          @RequestParam(required = false) String sortBy,
                          @RequestParam(required = false) String sortDir) {
        User user = requireUser(authorization);
        List<String> excludeStageList = parseCsvStages(excludeStages);
        return Result.success(aupService.list(user, page, size, keyword, registerNo, stage, excludeStage, excludeStageList, projectGroupName, dept, excludeDraft,
                draftSource, roundNo, submitterId, reviewerId, submitterName, reviewerName, relatedToMe, groupScopeOnly, sortBy, sortDir));
    }

    /** 逗号分隔的阶段列表（如 approved,expired） */
    private static List<String> parseCsvStages(String csv) {
        if (!StringUtils.hasText(csv)) {
            return List.of();
        }
        return java.util.Arrays.stream(csv.split(","))
                .map(String::trim)
                .filter(StringUtils::hasText)
                .toList();
    }

    /** 列表筛选用：去重课题组名称（下拉选项） */
    @GetMapping("/project-groups")
    public Result<?> projectGroups(@RequestHeader(value = "Authorization", required = false) String authorization) {
        requireUser(authorization);
        return Result.success(aupService.listProjectGroups());
    }

    /** 订购侧：列出当前用户课题组下已批准 AUP（下单必选 AUP 下拉；不接受客户端指定课题组） */
    @GetMapping("/approved-for-order")
    public Result<?> approvedForOrder(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = requireUser(authorization);
        return Result.success(aupService.listApprovedForOrder(user));
    }

    /** 课题组下拉数据源（本地 project_group 字典） */
    @GetMapping("/project-group-options")
    public Result<?> projectGroupOptions(@RequestHeader(value = "Authorization", required = false) String authorization) {
        requireUser(authorization);
        return Result.success(aupService.listProjectGroupOptions());
    }

    @PostMapping
    public Result<?> create(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @RequestBody(required = false) AupCreateRequest request) {
        User user = requireUser(authorization);
        String templateVersion = request == null ? null : request.getTemplateVersion();
        AupRecord record = aupService.createDraft(user, templateVersion);
        Map<String, Object> data = new HashMap<>();
        data.put("id", record.getId());
        data.put("registerNo", record.getRegisterNo());
        data.put("currentStage", record.getCurrentStage());
        data.put("templateVersion", record.getTemplateVersion());
        return Result.success(data);
    }

    @GetMapping("/{id}")
    public Result<?> detail(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @PathVariable("id") Long id) {
        User user = requireUser(authorization);
        AupDetailVO vo = aupService.detail(id, user);
        return Result.success(vo);
    }

    @PutMapping("/{id}")
    public Result<?> save(@RequestHeader(value = "Authorization", required = false) String authorization,
                          @PathVariable("id") Long id,
                          @RequestBody AupSaveRequest request) {
        User user = requireUser(authorization);
        return Result.success(aupService.save(id, request.getDataJson(), request.getExpectedVersion(), user));
    }

    @PutMapping("/{id}/autosave")
    public Result<?> autosave(@RequestHeader(value = "Authorization", required = false) String authorization,
                              @PathVariable("id") Long id,
                              @RequestBody AupSaveRequest request) {
        User user = requireUser(authorization);
        return Result.success(aupService.autosave(id, request.getDataJson(), request.getExpectedVersion(), user));
    }

    @PostMapping("/{id}/submit")
    public Result<?> submit(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @PathVariable("id") Long id) {
        User user = requireUser(authorization);
        List<AupValidationErrorDTO> errors = aupService.validate(id, user);
        if (!errors.isEmpty()) {
            return validationError(errors);
        }
        AupRecord record = aupService.submit(id, user);
        Map<String, Object> data = new HashMap<>();
        data.put("id", record.getId());
        data.put("currentStage", record.getCurrentStage());
        return Result.success(data);
    }

    @GetMapping("/{id}/validate")
    public Result<List<AupValidationErrorDTO>> validate(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                        @PathVariable("id") Long id) {
        User user = requireUser(authorization);
        return Result.success(aupService.validate(id, user));
    }

    @GetMapping("/{id}/snapshots")
    public Result<?> snapshots(@RequestHeader(value = "Authorization", required = false) String authorization,
                               @PathVariable("id") Long id) {
        User user = requireUser(authorization);
        return Result.success(aupService.listSnapshots(id, user));
    }

    @GetMapping("/{id}/snapshots/{snapId}")
    public Result<?> snapshot(@RequestHeader(value = "Authorization", required = false) String authorization,
                              @PathVariable("id") Long id,
                              @PathVariable("snapId") Long snapId) {
        User user = requireUser(authorization);
        return Result.success(aupService.getSnapshot(id, snapId, user));
    }

    @PostMapping("/{id}/snapshots/{snapId}/rollback")
    public Result<?> rollback(@RequestHeader(value = "Authorization", required = false) String authorization,
                              @PathVariable("id") Long id,
                              @PathVariable("snapId") Long snapId) {
        User user = requireUser(authorization);
        AupRecord record = aupService.rollback(id, snapId, user);
        Map<String, Object> data = new HashMap<>();
        data.put("id", record.getId());
        data.put("currentStage", record.getCurrentStage());
        return Result.success(data);
    }

    @PostMapping("/{id}/restore-demo")
    public Result<?> restoreDemo(@RequestHeader(value = "Authorization", required = false) String authorization,
                                 @PathVariable("id") Long id) {
        User user = requireUser(authorization);
        aupService.restoreDemo(id, user);
        return Result.success();
    }

    /** 重新生成演示示例（补齐缺失的 demo 计划书，幂等） */
    @PostMapping("/demo/reseed")
    public Result<?> reseedDemo(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = requireUser(authorization);
        return Result.success(aupService.reseedDemo(user));
    }

    @PostMapping("/{id}/unlock")
    public Result<?> unlock(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @PathVariable("id") Long id) {
        User user = requireUser(authorization);
        AupRecord record = aupService.unlock(id, user);
        Map<String, Object> data = new HashMap<>();
        data.put("id", record.getId());
        data.put("currentStage", record.getCurrentStage());
        return Result.success(data);
    }

    @PostMapping("/{id}/renew")
    public Result<?> renew(@RequestHeader(value = "Authorization", required = false) String authorization,
                           @PathVariable("id") Long id) {
        User user = requireUser(authorization);
        AupRecord record = aupService.renew(id, user);
        Map<String, Object> data = new HashMap<>();
        data.put("id", record.getId());
        data.put("registerNo", record.getRegisterNo());
        data.put("currentStage", record.getCurrentStage());
        return Result.success(data);
    }

    @DeleteMapping("/{id}")
    public Result<?> delete(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @PathVariable("id") Long id) {
        User user = requireUser(authorization);
        // 模拟学生视图时，删除等管理动作沿用教职工身份做权限判断
        User impersonator = authContextService.resolveImpersonator(authorization);
        aupService.delete(id, user, impersonator);
        return Result.success();
    }

    @PostMapping("/batch-delete")
    public Result<Map<String, Object>> batchDelete(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                   @RequestBody AupBatchDeleteRequest body) {
        User user = requireUser(authorization);
        User impersonator = authContextService.resolveImpersonator(authorization);
        if (body.isSelectAll()) {
            return Result.success(aupService.batchDeleteAll(body, user, impersonator));
        }
        return Result.success(aupService.batchDelete(body.getIds(), user, impersonator));
    }

    @GetMapping("/{id}/traces")
    public Result<?> traces(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @PathVariable("id") Long id) {
        User user = requireUser(authorization);
        return Result.success(aupService.listTraces(id, user));
    }

    @GetMapping("/{id}/print-data")
    public Result<?> printData(@RequestHeader(value = "Authorization", required = false) String authorization,
                               @PathVariable("id") Long id) {
        User user = requireUser(authorization);
        return Result.success(aupService.printData(id, user));
    }

    // ---- 附件 ----

    @PostMapping("/{id}/attachments")
    public Result<?> uploadAttachment(@RequestHeader(value = "Authorization", required = false) String authorization,
                                      @PathVariable("id") Long id,
                                      @RequestParam("file") MultipartFile file) {
        User user = requireUser(authorization);
        return Result.success(aupService.uploadAttachment(id, file, user));
    }

    @GetMapping("/{id}/attachments")
    public Result<?> listAttachments(@RequestHeader(value = "Authorization", required = false) String authorization,
                                     @PathVariable("id") Long id) {
        User user = requireUser(authorization);
        return Result.success(aupService.listAttachments(id, user));
    }

    @GetMapping("/attachments/{fileId}/download")
    public ResponseEntity<Resource> download(@RequestHeader(value = "Authorization", required = false) String authorization,
                                             @PathVariable("fileId") Long fileId) {
        User user = requireUser(authorization);
        UploadFileRecord record = aupService.resolveDownload(fileId, user);
        File file = uploadFileService.resolveBaseDir().resolve(record.getStorageKey()).normalize().toFile();
        if (!file.exists() || !file.isFile()) {
            return ResponseEntity.notFound().build();
        }
        String safeName = StringUtils.hasText(record.getOriginalName())
                ? record.getOriginalName() : (file.getName());
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header("Content-Disposition", "attachment; filename=\"" + safeName.replace("\"", "") + "\"")
                .body(new FileSystemResource(file));
    }

    @DeleteMapping("/{id}/attachments/{fileId}")
    public Result<?> deleteAttachment(@RequestHeader(value = "Authorization", required = false) String authorization,
                                      @PathVariable("id") Long id,
                                      @PathVariable("fileId") Long fileId) {
        User user = requireUser(authorization);
        aupService.deleteAttachment(id, fileId, user);
        return Result.success();
    }

    // ---- 签名 ----

    @GetMapping("/signature-context")
    public Result<?> signatureContext(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = requireUser(authorization);
        SignatureContextVO vo = aupService.signatureContext(user);
        return Result.success(vo);
    }

    @GetMapping("/my-roles")
    public Result<?> myRoles(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = requireUser(authorization);
        Map<String, Object> data = new HashMap<>();
        data.put("isPi", accessPolicy.isPi(user));
        data.put("isSecretary", accessPolicy.isSecretary(user.getId()));
        data.put("isExpert", accessPolicy.isExpert(user.getId()));
        return Result.success(data);
    }

    /** 管理员手动触发：从 ARO 全量同步计划书（正文 + 状态 + 评审记录）。 */
    @PostMapping("/sync-from-aro")
    public Result<?> syncFromAro(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = requireUser(authorization);
        if (!accessPolicy.isAdmin(user)) {
            throw TwinBusinessException.of(403, "仅管理员可同步 ARO 计划书");
        }
        return Result.success(aupAroSyncService.syncFromAro());
    }

  // ---- 选择器数据源 ----

    @GetMapping("/pickers/{type}")
    public Result<?> pickers(@RequestHeader(value = "Authorization", required = false) String authorization,
                             @PathVariable("type") String type,
                             @RequestParam Map<String, String> params) {
        requireUser(authorization);
        return Result.success(aupService.listPickers(type, params));
    }

    // ---- helpers ----

    private User requireUser(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            throw TwinBusinessException.of(401, "未登录或 Token 无效");
        }
        return user;
    }

    private Result<List<AupValidationErrorDTO>> validationError(List<AupValidationErrorDTO> errors) {
        Result<List<AupValidationErrorDTO>> result = new Result<>();
        result.setCode(400);
        result.setSuccess(false);
        StringBuilder detail = new StringBuilder();
        int shown = 0;
        for (AupValidationErrorDTO e : errors) {
            if (e.getMessage() != null && !e.getMessage().isBlank()) {
                if (shown > 0) detail.append("；");
                detail.append(e.getMessage());
                if (++shown >= 5) break;
            }
        }
        result.setMessage(detail.length() > 0
                ? "校验未通过：" + detail + (errors.size() > shown ? " 等" : "")
                : "校验未通过");
        result.setData(errors);
        return result;
    }
}
