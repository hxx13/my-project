package com.example.demo.modules.print.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.print.entity.PrintJob;
import com.example.demo.modules.print.entity.PrintStation;
import com.example.demo.modules.print.service.PrintJobPushService;
import com.example.demo.modules.print.service.PrintJobService;
import com.example.demo.modules.print.service.PrintJobViewAssembler;
import com.example.demo.modules.print.service.PrintSourceResolver;
import com.example.demo.modules.print.service.PrintStationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 打印管理端。工位 CRUD（含给工位绑定打印者账号）与重推都仅限 ADMIN，
 * 普通人员只能在发起打印时选打印机。
 *
 * 权限沿用现有角色层级比大小，不新建权限矩阵 —— 本功能只有管理员一个特殊层。
 */
@RestController
@RequestMapping("/api/admin/print")
@Tag(name = "打印-管理端")
public class PrintAdminController {

    private final PrintStationService stationService;
    private final PrintJobService jobService;
    private final PrintJobPushService pushService;
    private final AuthContextService authContextService;
    private final UserDisplayNameService userDisplayNameService;
    private final PrintJobViewAssembler jobViewAssembler;
    private final PrintSourceResolver sourceResolver;

    public PrintAdminController(PrintStationService stationService,
                                PrintJobService jobService,
                                PrintJobPushService pushService,
                                AuthContextService authContextService,
                                UserDisplayNameService userDisplayNameService,
                                PrintJobViewAssembler jobViewAssembler,
                                PrintSourceResolver sourceResolver) {
        this.stationService = stationService;
        this.jobService = jobService;
        this.pushService = pushService;
        this.authContextService = authContextService;
        this.userDisplayNameService = userDisplayNameService;
        this.jobViewAssembler = jobViewAssembler;
        this.sourceResolver = sourceResolver;
    }

    /** 配置打印工位（绑哪个账号、哪台机器）要最高权限。 */
    private User requireSuperAdmin(String authHeader) {
        User u = authContextService.resolveUserFromBearer(authHeader);
        if (u == null || u.getRole() == null || u.getRole().getLevel() < RoleEnum.SUPER_ADMIN.getLevel()) {
            throw new TwinBusinessException(403, "需要超级管理员权限");
        }
        return u;
    }

    /** 发起打印、看队列与历史只要教职工即可。 */
    private User requireStaff(String authHeader) {
        User u = authContextService.resolveUserFromBearer(authHeader);
        if (u == null || u.getRole() == null || u.getRole().getLevel() < RoleEnum.STAFF.getLevel()) {
            throw new TwinBusinessException(403, "需要教职工权限");
        }
        return u;
    }

    /* ────────────── 工位（配置：最高权限） ────────────── */

    @GetMapping("/stations")
    @Operation(summary = "工位列表")
    public Result<List<Map<String, Object>>> listStations(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth) {
        requireSuperAdmin(auth);
        return Result.success(stationService.listAll().stream().map(this::toStationView).toList());
    }

    @PostMapping("/stations")
    @Operation(summary = "新建工位（绑定打印者账号）")
    public Result<Map<String, Object>> createStation(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth,
            @RequestBody PrintStation body) {
        User u = requireSuperAdmin(auth);
        return Result.success(toStationView(stationService.create(body, u.getId())));
    }

    @PutMapping("/stations/{id}")
    @Operation(summary = "更新工位")
    public Result<Map<String, Object>> updateStation(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth,
            @PathVariable String id,
            @RequestBody PrintStation body) {
        requireSuperAdmin(auth);
        return Result.success(toStationView(stationService.update(id, body)));
    }

    /**
     * 列表要回答「这个工位绑的是谁」。user_id 是 STAFF_xxx，摆给管理员看没有意义，
     * 所以补一个显示名。解析失败退回 userId —— 一个人的名字取不到不该让整张列表挂掉。
     */
    private Map<String, Object> toStationView(PrintStation s) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", s.getId());
        out.put("name", s.getName());
        out.put("userId", s.getUserId());
        out.put("userDisplayName", resolveDisplayName(s.getUserId()));
        out.put("pageSize", s.getPageSize());
        out.put("supportedTypes", s.getSupportedTypes());
        out.put("enabled", s.isEnabled());
        out.put("createdAt", s.getCreatedAt());
        return out;
    }

    private String resolveDisplayName(String userId) {
        if (userId == null || userId.isBlank()) return "";
        try {
            String n = userDisplayNameService.resolveDisplayName(userId);
            return n == null || n.isBlank() ? userId : n;
        } catch (Exception e) {
            return userId;
        }
    }

    @DeleteMapping("/stations/{id}")
    @Operation(summary = "删除工位")
    public Result<Void> deleteStation(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth,
            @PathVariable String id) {
        requireSuperAdmin(auth);
        stationService.delete(id);
        return Result.success();
    }

    @PostMapping("/stations/{id}/reload")
    @Operation(summary = "让该工位的页面刷新")
    public Result<Map<String, Object>> reloadStation(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth,
            @PathVariable String id) {
        requireSuperAdmin(auth);
        PrintStation s = stationService.findById(id)
                .orElseThrow(() -> new TwinBusinessException(404, "工位不存在"));
        pushService.reloadStation(s);
        return Result.success(Map.of("ok", true));
    }

    /* ────────────── 任务 ────────────── */

    /**
     * 派发前的预览：返回**实际会被打印的那份**。
     *
     * 跟「文件模板」的下载接口不是一回事 —— 那个给用户上传的原文件（.docx），
     * 这个给转换后的 PDF。预览必须跟出纸一致，否则看了也白看。
     */
    @GetMapping("/preview")
    @Operation(summary = "派发前预览（返回实际要打印的文件）")
    public ResponseEntity<byte[]> preview(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth,
            @RequestParam String sourceType,
            @RequestParam String sourceId) throws IOException {
        requireStaff(auth);
        byte[] bytes = sourceResolver.resolve(sourceType, sourceId)
                .orElseThrow(() -> new TwinBusinessException(404, "文件不存在或已被清理"));
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_OCTET_STREAM_VALUE)
                .body(bytes);
    }

    @PostMapping("/jobs")
    @Operation(summary = "建打印任务（教职工即可）")
    public Result<Map<String, Object>> createJob(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth,
            @RequestBody Map<String, Object> body) {
        User u = requireStaff(auth);
        String stationId = String.valueOf(body.get("stationId"));
        String sourceType = String.valueOf(body.get("sourceType"));
        String sourceId = String.valueOf(body.get("sourceId"));
        String fileName = body.get("fileName") == null ? "" : String.valueOf(body.get("fileName"));
        int copies = body.get("copies") == null ? 1 : Integer.parseInt(String.valueOf(body.get("copies")));
        String note = body.get("note") == null ? null : String.valueOf(body.get("note"));
        int priority = Boolean.TRUE.equals(body.get("urgent"))
                ? PrintJob.PRIORITY_URGENT : PrintJob.PRIORITY_NORMAL;
        PrintJob job = jobService.create(stationId, sourceType, sourceId, fileName, copies,
                u.getId(), note, priority);
        stationService.findById(stationId).ifPresent(st -> pushService.notifyNewJob(st, job.getId()));
        return Result.success(jobViewAssembler.toView(job));
    }

    @GetMapping("/jobs/queue")
    @Operation(summary = "队列：还没结束的任务")
    public Result<List<Map<String, Object>>> queue(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth,
            @RequestParam(required = false) String stationId,
            @RequestParam(defaultValue = "100") int limit) {
        requireStaff(auth);
        return Result.success(jobViewAssembler.toViews(jobService.listQueue(stationId, limit)));
    }

    @GetMapping("/jobs/history")
    @Operation(summary = "历史：全部状态，可按工位与状态筛")
    public Result<List<Map<String, Object>>> history(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth,
            @RequestParam(required = false) String stationId,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "200") int limit) {
        requireStaff(auth);
        return Result.success(jobViewAssembler.toViews(jobService.listHistory(stationId, status, limit)));
    }

    @PostMapping("/jobs/{id}/cancel")
    @Operation(summary = "撤回排队中的任务，或收掉失败的任务")
    public Result<Map<String, Object>> cancel(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth,
            @PathVariable String id) {
        requireStaff(auth);
        if (!jobService.cancel(id)) {
            return Result.error("只有排队中和失败的任务能撤回；已经被打印机领走的撤不回来");
        }
        return Result.success(Map.of("ok", true));
    }

    @GetMapping("/jobs")
    @Operation(summary = "任务列表")
    public Result<List<Map<String, Object>>> listJobs(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth,
            @RequestParam(defaultValue = "100") int limit) {
        requireStaff(auth);
        return Result.success(jobViewAssembler.toViews(jobService.listAll(limit)));
    }

    @PostMapping("/jobs/{id}/retry")
    @Operation(summary = "重推失败任务")
    public Result<Map<String, Object>> retry(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth,
            @PathVariable String id) {
        requireStaff(auth);
        if (!jobService.retry(id)) {
            return Result.error("该任务当前状态不可重推");
        }
        jobService.findById(id).ifPresent(j -> stationService.findById(j.getStationId())
                .ifPresent(st -> pushService.notifyNewJob(st, j.getId())));
        return Result.success(Map.of("ok", true));
    }
}
