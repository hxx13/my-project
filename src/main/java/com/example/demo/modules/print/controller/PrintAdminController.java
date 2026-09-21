package com.example.demo.modules.print.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.print.entity.PrintJob;
import com.example.demo.modules.print.entity.PrintStation;
import com.example.demo.modules.print.service.DirectPrintService;
import com.example.demo.modules.print.service.PrintJobPushService;
import com.example.demo.modules.print.service.PrintJobService;
import com.example.demo.modules.print.service.PrintJobViewAssembler;
import com.example.demo.modules.print.service.PrintQueueControlService;
import com.example.demo.modules.print.service.PrintSourceResolver;
import com.example.demo.modules.print.service.PrintStationHealthService;
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
    private final DirectPrintService directPrintService;
    private final PrintStationHealthService healthService;
    private final PrintQueueControlService queueControlService;

    public PrintAdminController(PrintStationService stationService,
                                PrintJobService jobService,
                                PrintJobPushService pushService,
                                AuthContextService authContextService,
                                UserDisplayNameService userDisplayNameService,
                                PrintJobViewAssembler jobViewAssembler,
                                PrintSourceResolver sourceResolver,
                                DirectPrintService directPrintService,
                                PrintStationHealthService healthService,
                                PrintQueueControlService queueControlService) {
        this.stationService = stationService;
        this.jobService = jobService;
        this.pushService = pushService;
        this.authContextService = authContextService;
        this.userDisplayNameService = userDisplayNameService;
        this.jobViewAssembler = jobViewAssembler;
        this.sourceResolver = sourceResolver;
        this.directPrintService = directPrintService;
        this.healthService = healthService;
        this.queueControlService = queueControlService;
    }

    /**
     * 把任务交给它的工位去执行。**两条派发路径都必须走这里**（建单与重推），
     * 否则直发工位的任务会停在 PENDING —— 而 PENDING 没有任何超时兜底，
     * 就是永久卡住、还不出声。
     */
    private void dispatch(PrintJob job, PrintStation station) {
        if (station == null) return;
        if (PrintStation.MODE_SERVER.equals(station.getMode())) {
            directPrintService.printNow(job, station);
        } else {
            pushService.notifyNewJob(station, job.getId());
        }
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

    /**
     * 清队列是 ADMIN 起的动作：它会连别人正排着的任务一起打掉，
     * 跟「撤回我自己那一条」不是一个当量。
     */
    private static boolean canClearQueue(User u) {
        return u != null && u.getRole() != null
                && u.getRole().getLevel() >= RoleEnum.ADMIN.getLevel();
    }

    private User requireAdmin(String authHeader) {
        User u = requireStaff(authHeader);
        if (!canClearQueue(u)) {
            throw new TwinBusinessException(403, "需要管理员权限");
        }
        return u;
    }

    /**
     * 当前账号能做什么。队列弹窗挂在**教职工可见**的页面上，但清队列要 ADMIN ——
     * 让 web 和小程序各自判断「当前角色够不够」就等于把同一条权限规则抄两份，
     * 那正是《后台入口注册规范》里三层必须一致的坑换个地方犯。
     * 判据只在服务端一处，客户端问它。
     */
    @GetMapping("/capabilities")
    @Operation(summary = "当前账号能做什么（前端据此决定按钮出不出现）")
    public Result<Map<String, Object>> capabilities(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth) {
        User u = requireStaff(auth);
        return Result.success(Map.of("canClearQueue", canClearQueue(u)));
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
        out.put("printerIp", s.getPrinterIp());
        out.put("mode", s.getMode());
        out.put("enabled", s.isEnabled());
        PrintStationHealthService.Health health = healthService.liveStatusOf(s);
        out.put("liveStatus", health.status().name());
        out.put("liveStatusReason", health.reason());
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

    /**
     * 清空这台打印机队列里的所有作业。
     *
     * <p><b>先 CUPS 清，再落库，顺序不能反。</b>反了的话 CUPS 那步失败时库里已经收起了记录，
     * 界面说清掉了而纸照样会出来。同理 CUPS 那步抛异常就让整个请求失败 ——
     * 用户点「清空」是明确要求「把这台机器上所有排队的都撤掉」，命令没跑成功却回一句
     * 「已清空」，他以为队列空了、实际纸还会照常出来。
     */
    @PostMapping("/stations/{id}/queue/clear")
    @Operation(summary = "清空这台打印机的队列（仅直发工位）")
    public Result<Map<String, Object>> clearStationQueue(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth,
            @PathVariable String id) throws InterruptedException {
        requireAdmin(auth);
        PrintStation station = stationService.findById(id)
                .orElseThrow(() -> new TwinBusinessException(404, "工位不存在"));
        if (!PrintStation.MODE_SERVER.equals(station.getMode())) {
            return Result.error("这台工位是「工位电脑执行」，没有可清的服务端队列");
        }
        int cupsCount;
        try {
            cupsCount = queueControlService.clearQueue(station.getPrinterIp());
        } catch (IOException e) {
            // 不能只清库就回成功：那样队列里的纸还会照样打出来
            throw new TwinBusinessException(500, "清空打印机队列失败：" + e.getMessage());
        }
        int dbCount = jobService.cancelQueued(station.getId());
        return Result.success(Map.of("cleared", cupsCount, "cancelled", dbCount));
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
        stationService.findById(stationId).ifPresent(st -> dispatch(job, st));
        // 回给前端的状态要拿库里的：直发是同步打完的，用建单时的内存对象会显示成 PENDING
        return Result.success(jobViewAssembler.toView(
                jobService.findById(job.getId()).orElse(job)));
    }

    @GetMapping("/jobs/queue")
    @Operation(summary = "队列：还没结束的任务")
    public Result<List<Map<String, Object>>> queue(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth,
            @RequestParam(required = false) String stationId,
            @RequestParam(defaultValue = "100") int limit) {
        User u = requireStaff(auth);
        return Result.success(jobViewAssembler.toViews(jobService.listQueue(stationId, u.getId(), limit)));
    }

    @GetMapping("/jobs/history")
    @Operation(summary = "历史：全部状态，可按工位与状态筛")
    public Result<List<Map<String, Object>>> history(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth,
            @RequestParam(required = false) String stationId,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "200") int limit) {
        User u = requireStaff(auth);
        return Result.success(jobViewAssembler.toViews(jobService.listHistory(stationId, status, u.getId(), limit)));
    }

    @PostMapping("/jobs/{id}/cancel")
    @Operation(summary = "撤回排队中的任务、收掉失败的任务，或撤销还排在打印机队列里的直发任务")
    public Result<Map<String, Object>> cancel(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth,
            @PathVariable String id) throws InterruptedException {
        requireStaff(auth);
        PrintJob job = jobService.findById(id)
                .orElseThrow(() -> new TwinBusinessException(404, "任务不存在"));

        // 直发任务被 CUPS 收下后库里就是 PRINTED（lp 退出码 0），cancel() 够不着它 ——
        // 那种任务卡在队列里撤不掉，正是这次要补的能力。先撤 CUPS 那一条，再落库。
        //
        // 但**只有核对确实看到它还排在队列里**才走这条路。queue_state 为 CLEARED 时这条
        // 早就打完了，纸已经在路上，撤不得；为 NULL 时（刚提交还没轮到核对、或这台机器
        // 根本问不到队列）无从判断，同样不给撤 —— 宁可不给，也不能把「已完成」改成
        // 「已撤回」，那是比原事故更坏的谎。
        boolean stillQueued = PrintJob.QUEUE_QUEUED.equals(job.getQueueState());
        boolean serverStation = stationService.findById(job.getStationId())
                .map(s -> PrintStation.MODE_SERVER.equals(s.getMode()))
                .orElse(false);
        if (serverStation && stillQueued
                && job.getCupsJobId() != null && !job.getCupsJobId().isBlank()) {
            try {
                queueControlService.cancelJob(job.getCupsJobId());
            } catch (IOException e) {
                // 命令没配才走到这（作业已不在队列时 cancelJob 自己吞掉）。
                // 这时候不能说"撤了"——CUPS 那侧没动过，纸还会出来。
                return Result.error("没能撤销打印机队列里的这条作业：" + e.getMessage());
            }
            if (!jobService.cancelAny(id)) {
                return Result.error("这条任务已经撤过了");
            }
            return Result.success(Map.of("ok", true));
        }

        if (!jobService.cancel(id)) {
            return Result.error("这条任务撤不回来：它已经被打印机领走并开始打印了。"
                    + "排队中的、失败的、以及还排在打印机队列里的都可以撤。");
        }
        return Result.success(Map.of("ok", true));
    }

    @GetMapping("/jobs")
    @Operation(summary = "任务列表")
    public Result<List<Map<String, Object>>> listJobs(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String auth,
            @RequestParam(defaultValue = "100") int limit) {
        User u = requireStaff(auth);
        return Result.success(jobViewAssembler.toViews(jobService.listAll(u.getId(), limit)));
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
                .ifPresent(st -> dispatch(j, st)));
        return Result.success(Map.of("ok", true));
    }
}
