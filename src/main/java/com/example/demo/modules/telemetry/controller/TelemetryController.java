package com.example.demo.modules.telemetry.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.telemetry.animalroom.AnimalRoomHubAssembler;
import com.example.demo.modules.telemetry.animalroom.AnimalRoomSyntheticHvacTelemetryReducer;
import com.example.demo.modules.telemetry.animalroom.AnimalRoomTelemetryPageReducer;
import com.example.demo.modules.telemetry.animalroom.dto.AnimalRoomHubDto;
import com.example.demo.modules.telemetry.animalroom.dto.AnimalRoomSummaryWithTabDto;
import com.example.demo.modules.telemetry.animalroom.dto.AnimalRoomTelemetryPageDto;
import com.example.demo.modules.telemetry.dto.TelemetrySequentialDiagnosticDto;
import com.example.demo.modules.telemetry.dto.TelemetrySnapshotDto;
import com.example.demo.modules.telemetry.dto.TelemetryTagItemDto;
import com.example.demo.modules.telemetry.dto.TelemetryWinccDockPollConfigDto;
import com.example.demo.modules.telemetry.service.TelemetrySnapshotService;
import com.example.demo.modules.telemetry.service.WatchlistAlarmLimitsFacadeService;
import com.example.demo.modules.twin.service.JobSchedulerService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@RestController
@RequestMapping("/api/v1/telemetry/wincc")
@CrossOrigin(origins = "*")
@Tag(name = "动物房遥测", description = "WinCC 只读快照（内存缓存）；动物房 Hub 与 Web/小程序同源")
public class TelemetryController {

    private static final Logger log = LoggerFactory.getLogger(TelemetryController.class);

    private final TelemetrySnapshotService telemetrySnapshotService;
    private final JobSchedulerService jobSchedulerService;
    private final AnimalRoomHubAssembler animalRoomHubAssembler;
    private final WatchlistAlarmLimitsFacadeService watchlistAlarmLimitsFacade;

    public TelemetryController(TelemetrySnapshotService telemetrySnapshotService,
                               JobSchedulerService jobSchedulerService,
                               AnimalRoomHubAssembler animalRoomHubAssembler,
                               WatchlistAlarmLimitsFacadeService watchlistAlarmLimitsFacade) {
        this.telemetrySnapshotService = telemetrySnapshotService;
        this.jobSchedulerService = jobSchedulerService;
        this.animalRoomHubAssembler = animalRoomHubAssembler;
        this.watchlistAlarmLimitsFacade = watchlistAlarmLimitsFacade;
    }

    /** 内存快照不含报警限；返回前合并全局报警限（与 POST /watchlists/alarm-limits/query 同源）。 */
    private TelemetrySnapshotDto attachAlarmLimitsFromWatchlist(TelemetrySnapshotDto snap) {
        if (snap == null || snap.getItems() == null || snap.getItems().isEmpty()) {
            return snap;
        }
        List<TelemetryTagItemDto> merged = watchlistAlarmLimitsFacade.mergeAlarmLimitsIntoSnapshotItems(snap.getItems());
        return TelemetrySnapshotDto.builder()
                .winccEnabled(snap.isWinccEnabled())
                .fetchedAt(snap.getFetchedAt())
                .items(merged)
                .lastError(snap.getLastError())
                .winccReachable(snap.isWinccReachable())
                .build();
    }

    private static AnimalRoomTelemetryPageDto toAnimalRoomPage(AnimalRoomHubDto hub, TelemetrySnapshotDto snap) {
        return AnimalRoomTelemetryPageDto.builder()
                .fetchedAt(snap.getFetchedAt())
                .winccEnabled(snap.isWinccEnabled())
                .tabs(hub.getStructuredTabs() != null ? hub.getStructuredTabs() : List.of())
                .tagItems(snap.getItems() != null ? snap.getItems() : List.of())
                .pollIntervalMs(hub.getClientPollIntervalMs())
                .runningStatusRooms(hub.getRunningStatusRooms() != null ? hub.getRunningStatusRooms() : List.of())
                .build();
    }

    /** 一次 WinCC 刷新（若 sync）+ 一次 Hub 组装，供 /animal-room 与 /animal-room-with-tab 共用。 */
    private AnimalRoomTelemetryPageDto loadAnimalRoomTelemetryPage(boolean sync, int soloWidthPx,
                                                                     String campus, String hubClient) {
        if (sync) {
            telemetrySnapshotService.refreshFromWinCc();
        }
        TelemetrySnapshotDto snap = attachAlarmLimitsFromWatchlist(telemetrySnapshotService.getSnapshot());
        TelemetryWinccDockPollConfigDto dock = jobSchedulerService.getWinccDockPollConfig();
        AnimalRoomHubDto hub = animalRoomHubAssembler.assemble(snap, dock, soloWidthPx, campus, hubClient);
        return toAnimalRoomPage(hub, snap);
    }

    private static List<String> parseCommaSeparatedVariableNames(String raw) {
        if (!StringUtils.hasText(raw)) {
            return List.of();
        }
        LinkedHashSet<String> out = new LinkedHashSet<>();
        for (String p : raw.split(",")) {
            String s = p == null ? "" : p.trim();
            if (!s.isEmpty()) {
                out.add(s);
            }
        }
        return List.copyOf(out);
    }

    private static TelemetrySnapshotDto filterSnapshotItemsToVariableNames(TelemetrySnapshotDto src, List<String> names) {
        if (src == null) {
            return null;
        }
        Set<String> want = new HashSet<>();
        for (String n : names) {
            if (StringUtils.hasText(n)) {
                want.add(n.trim().toLowerCase());
            }
        }
        if (want.isEmpty()) {
            return src;
        }
        List<TelemetryTagItemDto> items = src.getItems() == null ? List.of() : src.getItems();
        List<TelemetryTagItemDto> keep = new ArrayList<>();
        for (TelemetryTagItemDto it : items) {
            if (it == null || !StringUtils.hasText(it.getVariableName())) {
                continue;
            }
            if (want.contains(it.getVariableName().trim().toLowerCase())) {
                keep.add(it);
            }
        }
        return TelemetrySnapshotDto.builder()
                .winccEnabled(src.isWinccEnabled())
                .fetchedAt(src.getFetchedAt())
                .items(keep)
                .lastError(src.getLastError())
                .winccReachable(src.isWinccReachable())
                .build();
    }

    @GetMapping("/dock-poll-config")
    @Operation(summary = "动物房程序坞轮询配置",
            description = "读取定时管理中的 TELEMETRY_WINCC_UI：开关、轮询间隔(秒)、时间窗与周计划；不参与服务端 tick。")
    public Result<TelemetryWinccDockPollConfigDto> dockPollConfig() {
        return Result.success(jobSchedulerService.getWinccDockPollConfig());
    }

    @GetMapping("/snapshot")
    @Operation(summary = "获取温湿度等测点最新快照",
            description = "默认只读内存缓存。sync=true 且无 variableNames 时全量刷新 WinCC；"
                    + "sync=true 且带 variableNames（逗号分隔）时仅对该批变量定点读回并合并内存快照，响应体仅含这些行，适合写入后轮询校验。")
    public Result<TelemetrySnapshotDto> snapshot(
            @RequestParam(value = "sync", defaultValue = "false") boolean sync,
            @RequestParam(value = "variableNames", required = false) String variableNames) {
        List<String> vars = parseCommaSeparatedVariableNames(variableNames);
        if (sync) {
            if (!vars.isEmpty()) {
                telemetrySnapshotService.mergeWinCcReadingsIntoCachedSnapshot(vars);
            } else {
                telemetrySnapshotService.refreshFromWinCc();
            }
        } else if (log.isDebugEnabled()) {
            log.debug("[WinCC遥测] HTTP 请求：仅读内存快照（sync=false）");
        }
        TelemetrySnapshotDto dto = attachAlarmLimitsFromWatchlist(telemetrySnapshotService.getSnapshot());
        if (!vars.isEmpty()) {
            dto = filterSnapshotItemsToVariableNames(dto, vars);
        }
        if (sync && StringUtils.hasText(dto.getLastError())) {
            log.warn("[WinCC遥测] snapshot 同步后快照仍带错误: {}", dto.getLastError());
        }
        if (log.isDebugEnabled()) {
            int n = dto.getItems() == null ? 0 : dto.getItems().size();
            log.debug("[WinCC遥测] 返回快照 sync={} winccEnabled={} itemCount={} winccReachable={} lastError={}",
                    sync, dto.isWinccEnabled(), n, dto.isWinccReachable(), dto.getLastError());
        }
        return Result.success(dto);
    }

    /**
     * 动物房 Hub（Web 与微信小程序同源）：快照、程序坞配置、结构化温湿度视图、运行状态房间列表（与 wechat-overview 同源）。
     * 与 {@link #snapshot(boolean)} 共用内存快照；sync=true 时先刷新 WinCC 再组装。
     */
    @GetMapping("/animal-room-hub")
    @Operation(summary = "动物房 Hub（Web/小程序同源）",
            description = "一次返回：快照、dock 轮询配置、structuredTabs（含 viewChunks）、clientPollIntervalMs、runningStatusRooms（与 GET .../twin/dashboard/wechat-overview 同源）。Query：campus 同 wechat-overview。")
    public Result<AnimalRoomHubDto> animalRoomHub(
            @RequestParam(value = "sync", defaultValue = "false") boolean sync,
            @RequestParam(value = "soloWidthPx", defaultValue = "360") int soloWidthPx,
            @RequestParam(value = "campus", required = false) String campus,
            @RequestParam(value = "hubClient", required = false) String hubClient) {
        if (sync) {
            telemetrySnapshotService.refreshFromWinCc();
        }
        TelemetrySnapshotDto snap = attachAlarmLimitsFromWatchlist(telemetrySnapshotService.getSnapshot());
        TelemetryWinccDockPollConfigDto dock = jobSchedulerService.getWinccDockPollConfig();
        AnimalRoomHubDto hub = animalRoomHubAssembler.assemble(snap, dock, soloWidthPx, campus, hubClient);
        if (log.isDebugEnabled()) {
            log.debug("[WinCC遥测] animal-room-hub tabs={} items={} runningRooms={}",
                    hub.getStructuredTabs() == null ? 0 : hub.getStructuredTabs().size(),
                    snap.getItems() == null ? 0 : snap.getItems().size(),
                    hub.getRunningStatusRooms() == null ? 0 : hub.getRunningStatusRooms().size());
        }
        return Result.success(hub);
    }

    /**
     * 动物房温湿度页推荐入口：与 {@link #animalRoomHub(boolean, int, String)} 同源组装，扁平字段（tabs、tagItems、fetchedAt…），无嵌套「快照」对象。
     */
    @GetMapping("/animal-room")
    @Operation(summary = "动物房温湿度页数据",
            description = "一次返回 tabs（含 viewChunks）、tagItems、fetchedAt、pollIntervalMs、runningStatusRooms；与 /animal-room-hub 同源，字段更扁平。"
                    + " telemetrySummaryOnly=true 时仅返回 tab 元数据（viewChunks 空、tagItems 空），便于小程序分块加载避开云函数约 1MB 回包上限。"
                    + " telemetryTabKey 指定时仅返回该结构化分页签的 viewChunks 及归属该 tab 的 tagItems；"
                    + " telemetryTabKey=__hvac_units__ 时返回机房合成块（hvacMechanicalHubViewChunks）及仅机房相关 tagItems，各层 tabs 无 viewChunks。")
    public Result<AnimalRoomTelemetryPageDto> animalRoom(
            @RequestParam(value = "sync", defaultValue = "false") boolean sync,
            @RequestParam(value = "soloWidthPx", defaultValue = "360") int soloWidthPx,
            @RequestParam(value = "campus", required = false) String campus,
            @RequestParam(value = "hubClient", required = false) String hubClient,
            @RequestParam(value = "telemetrySummaryOnly", defaultValue = "false") boolean telemetrySummaryOnly,
            @RequestParam(value = "telemetryTabKey", required = false) String telemetryTabKey) {
        AnimalRoomTelemetryPageDto page = loadAnimalRoomTelemetryPage(sync, soloWidthPx, campus, hubClient);
        if (telemetrySummaryOnly) {
            page = AnimalRoomTelemetryPageReducer.toSummaryOnly(page);
        } else if (telemetryTabKey != null && !telemetryTabKey.isBlank()) {
            String tk = telemetryTabKey.trim();
            if (AnimalRoomSyntheticHvacTelemetryReducer.isSyntheticHvacTabKey(tk)) {
                page = AnimalRoomSyntheticHvacTelemetryReducer.toHvacMechanicalDetailPage(page);
            } else {
                page = AnimalRoomTelemetryPageReducer.forSingleStructuredTab(page, tk);
            }
        }
        return Result.success(page);
    }

    /**
     * 小程序推荐：一次 HTTP 返回「全 tab 摘要」+「指定 tab 明细」，仅一次 WinCC 刷新与 Hub 组装（相对连续两次 GET /animal-room）。
     */
    @GetMapping("/animal-room-with-tab")
    @Operation(summary = "动物房：摘要 + 单层明细（合并响应）",
            description = "与连续请求 telemetrySummaryOnly + telemetryTabKey 语义一致，但服务端只 assemble 一次；telemetryTabKey 必填。")
    public Result<AnimalRoomSummaryWithTabDto> animalRoomWithTab(
            @RequestParam(value = "sync", defaultValue = "false") boolean sync,
            @RequestParam(value = "soloWidthPx", defaultValue = "360") int soloWidthPx,
            @RequestParam(value = "campus", required = false) String campus,
            @RequestParam(value = "hubClient", required = false) String hubClient,
            @RequestParam(value = "telemetryTabKey", required = false) String telemetryTabKey) {
        if (!StringUtils.hasText(telemetryTabKey)) {
            return Result.error("请传入 telemetryTabKey");
        }
        String tk = telemetryTabKey.trim();
        AnimalRoomTelemetryPageDto full = loadAnimalRoomTelemetryPage(sync, soloWidthPx, campus, hubClient);
        AnimalRoomTelemetryPageDto summary = AnimalRoomTelemetryPageReducer.toSummaryOnly(full);
        AnimalRoomTelemetryPageDto tabDetail = AnimalRoomSyntheticHvacTelemetryReducer.isSyntheticHvacTabKey(tk)
                ? AnimalRoomSyntheticHvacTelemetryReducer.toHvacMechanicalDetailPage(full)
                : AnimalRoomTelemetryPageReducer.forSingleStructuredTab(full, tk);
        return Result.success(AnimalRoomSummaryWithTabDto.builder()
                .summary(summary)
                .tabDetail(tabDetail)
                .build());
    }

    /**
     * @deprecated 请改用 {@link #animalRoomHub(boolean, int, String)}（路径：/animal-room-hub）。保留以兼容已上线小程序。
     */
    @Deprecated
    @GetMapping("/miniprogram-hub")
    @Operation(summary = "[已废弃] 请使用 GET /animal-room-hub", deprecated = true)
    public Result<AnimalRoomHubDto> miniprogramHub(
            @RequestParam(value = "sync", defaultValue = "false") boolean sync,
            @RequestParam(value = "soloWidthPx", defaultValue = "360") int soloWidthPx) {
        return animalRoomHub(sync, soloWidthPx, null, null);
    }

    @GetMapping("/diagnostic/sequential-built-in-then-watchlist")
    @Operation(summary = "顺序诊断 WinCC",
            description = "在同一锁内先后 POST：① 内置默认前 5 点 ② 当前 watchlist；不更新内存快照。用于对比变量问题与网络/服务端超时。")
    public Result<TelemetrySequentialDiagnosticDto> diagnosticSequentialBuiltInThenWatchlist() {
        if (log.isDebugEnabled()) {
            log.debug("[WinCC遥测] HTTP 请求：顺序诊断（内置默认 → 当前 watchlist）");
        }
        return Result.success(telemetrySnapshotService.runSequentialBuiltInThenWatchlist());
    }
}
