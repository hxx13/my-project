package com.example.demo.modules.print.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.print.entity.PrintJob;
import com.example.demo.modules.print.entity.PrintStation;
import com.example.demo.modules.print.service.PrintJobPushService;
import com.example.demo.modules.print.service.PrintJobService;
import com.example.demo.modules.print.service.PrintStationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.*;

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

    public PrintAdminController(PrintStationService stationService,
                                PrintJobService jobService,
                                PrintJobPushService pushService,
                                AuthContextService authContextService) {
        this.stationService = stationService;
        this.jobService = jobService;
        this.pushService = pushService;
        this.authContextService = authContextService;
    }

    private User requireAdmin(String authHeader) {
        User u = authContextService.resolveUserFromBearer(authHeader);
        if (u == null || u.getRole() == null || u.getRole().getLevel() < RoleEnum.ADMIN.getLevel()) {
            throw new TwinBusinessException(403, "需要管理员权限");
        }
        return u;
    }

    /* ────────────── 工位 ────────────── */

    @GetMapping("/stations")
    @Operation(summary = "工位列表")
    public Result<List<PrintStation>> listStations(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth) {
        requireAdmin(auth);
        return Result.success(stationService.listAll());
    }

    @PostMapping("/stations")
    @Operation(summary = "新建工位（绑定打印者账号）")
    public Result<PrintStation> createStation(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth,
            @RequestBody PrintStation body) {
        User u = requireAdmin(auth);
        return Result.success(stationService.create(body, u.getId()));
    }

    @PutMapping("/stations/{id}")
    @Operation(summary = "更新工位")
    public Result<PrintStation> updateStation(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth,
            @PathVariable String id,
            @RequestBody PrintStation body) {
        requireAdmin(auth);
        return Result.success(stationService.update(id, body));
    }

    @DeleteMapping("/stations/{id}")
    @Operation(summary = "删除工位")
    public Result<Void> deleteStation(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth,
            @PathVariable String id) {
        requireAdmin(auth);
        stationService.delete(id);
        return Result.success();
    }

    /* ────────────── 任务 ────────────── */

    @PostMapping("/jobs")
    @Operation(summary = "建打印任务")
    public Result<PrintJob> createJob(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth,
            @RequestBody Map<String, Object> body) {
        User u = requireAdmin(auth);
        String stationId = String.valueOf(body.get("stationId"));
        String sourceType = String.valueOf(body.get("sourceType"));
        String sourceId = String.valueOf(body.get("sourceId"));
        String fileName = body.get("fileName") == null ? "" : String.valueOf(body.get("fileName"));
        int copies = body.get("copies") == null ? 1 : Integer.parseInt(String.valueOf(body.get("copies")));
        PrintJob job = jobService.create(stationId, sourceType, sourceId, fileName, copies, u.getId());
        stationService.findById(stationId).ifPresent(st -> pushService.notifyNewJob(st, job.getId()));
        return Result.success(job);
    }

    @GetMapping("/jobs")
    @Operation(summary = "任务列表")
    public Result<List<PrintJob>> listJobs(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth,
            @RequestParam(defaultValue = "100") int limit) {
        requireAdmin(auth);
        return Result.success(jobService.listAll(limit));
    }

    @PostMapping("/jobs/{id}/retry")
    @Operation(summary = "重推失败任务")
    public Result<Map<String, Object>> retry(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth,
            @PathVariable String id) {
        requireAdmin(auth);
        if (!jobService.retry(id)) {
            return Result.error("该任务当前状态不可重推");
        }
        jobService.findById(id).ifPresent(j -> stationService.findById(j.getStationId())
                .ifPresent(st -> pushService.notifyNewJob(st, j.getId())));
        return Result.success(Map.of("ok", true));
    }
}
