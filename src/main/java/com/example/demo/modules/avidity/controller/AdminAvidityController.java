package com.example.demo.modules.avidity.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.avidity.entity.AvidityAlarmEvent;
import com.example.demo.modules.avidity.entity.AvidityLayoutPoint;
import com.example.demo.modules.avidity.service.AvidityAlarmEventService;
import com.example.demo.modules.avidity.service.AvidityAlarmService;
import com.example.demo.modules.avidity.service.AvidityLiveStateService;
import com.example.demo.modules.avidity.service.AvidityQueryService;
import com.example.demo.modules.avidity.service.AviditySyncService;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 安维迪(云组态)仪表盘数据接口。**ADMIN 及以上**。
 *
 * <p>数据由 {@link AviditySyncService} 定时拉回本地库，这里只读库，不回源 —— 后台页面
 * 因此不会因为我们与对方站点之间的网络抖动而卡住或空白。
 *
 * <p>前缀 /api/admin/** 已由 adminAuthInterceptor 把关，方法内再自守一道（仓库惯例）。
 */
@RestController
@RequestMapping("/api/admin/avidity")
@Tag(name = "安维迪仪表盘", description = "安维迪(云组态)接入：通道、告警统计、当前报警")
public class AdminAvidityController {

    private static final Logger log = LoggerFactory.getLogger(AdminAvidityController.class);

    private final AvidityQueryService queryService;
    private final AviditySyncService syncService;
    private final AvidityAlarmService alarmService;
    private final AvidityLiveStateService liveStateService;
    private final AvidityAlarmEventService alarmEventService;
    private final AuthContextService authContextService;

    public AdminAvidityController(AvidityQueryService queryService,
                                  AviditySyncService syncService,
                                  AvidityAlarmService alarmService,
                                  AvidityLiveStateService liveStateService,
                                  AvidityAlarmEventService alarmEventService,
                                  AuthContextService authContextService) {
        this.queryService = queryService;
        this.syncService = syncService;
        this.alarmService = alarmService;
        this.liveStateService = liveStateService;
        this.alarmEventService = alarmEventService;
        this.authContextService = authContextService;
    }

    @GetMapping("/live-states")
    @Operation(summary = "点位实时状态（0 正常 / 1 报警）。平面图上的灯按它上色，跟厂平台画面同一路数据")
    public Result<?> liveStates(@RequestParam(required = false) Long channelId,
                                @RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        // states 只回该通道那台设备上的点位；counts 是每台设备各算各的（顶栏角标要标全部通道）
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("connected", liveStateService.isConnected());
        out.put("states", liveStateService.snapshot(deviceIdsOf(channelId)));
        out.put("counts", liveStateService.alarmCountByDevice());
        out.put("error", liveStateService.lastError());
        return Result.success(out);
    }

    @GetMapping("/channels")
    @Operation(summary = "通道列表（页面顶部那排 tab）")
    public Result<?> channels(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(queryService.channels());
    }

    @GetMapping("/alarm-stats")
    @Operation(summary = "告警统计（缺省为今天，可指定日期与通道）")
    public Result<?> alarmStats(@RequestParam(required = false) Long channelId,
                                @RequestParam(required = false)
                                @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
                                @RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(queryService.alarmStats(date, channelId));
    }

    @GetMapping("/alarm-current")
    @Operation(summary = "当前**正在报警**的点位（按平面图房间归好档），数据来自我们自己记的报警事件")
    public Result<?> alarmCurrent(@RequestParam(required = false) Long channelId,
                                  @RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        List<AvidityAlarmEvent> open = alarmEventService.openAlarms(deviceIdsOf(channelId));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("count", open.size());
        out.put("rooms", alarmEventService.folderTree(open));
        return Result.success(out);
    }

    @GetMapping("/alarm-events")
    @Operation(summary = "报警历史（我们自己记的起止时间，按平面图房间归好档）")
    public Result<?> alarmEvents(@RequestParam(defaultValue = "7") int days,
                                 @RequestParam(required = false) Long channelId,
                                 @RequestParam(required = false) String alarmName,
                                 @RequestParam(defaultValue = "500") int limit,
                                 @RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        int span = Math.min(Math.max(days, 1), 365);
        java.time.LocalDateTime since = java.time.LocalDateTime.now()
                .minusDays(span).toLocalDate().atStartOfDay();
        List<AvidityAlarmEvent> rows =
                alarmEventService.history(since, deviceIdsOf(channelId), alarmName, limit);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("since", since.toLocalDate().toString());
        out.put("count", rows.size());
        out.put("rooms", alarmEventService.folderTree(rows));
        return Result.success(out);
    }

    /** 通道 → 设备：不传通道返回 null（＝不限设备）；通道没挂设备时给一个不存在的设备号（＝查不到）。 */
    private List<Long> deviceIdsOf(Long channelId) {
        if (channelId == null) return null;
        for (var channel : queryService.channels()) {
            if (channelId.equals(channel.getChannelId())) {
                return channel.getVirtualDeviceId() == null
                        ? List.of(NO_DEVICE) : List.of(channel.getVirtualDeviceId());
            }
        }
        return List.of(NO_DEVICE);
    }

    /** 不可能存在的设备号。用来表达「这个通道名下没有设备」，别让它退化成「全库」。 */
    private static final long NO_DEVICE = -1L;

    @GetMapping("/status")
    @Operation(summary = "本地库概览（不发网络请求）")
    public Result<?> status(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        Map<String, Object> status = new LinkedHashMap<>();
        status.put("enabled", queryService.upstreamEnabled());
        status.put("channelCount", queryService.channels().size());
        status.put("currentAlarmCount", queryService.currentAlarms().size());
        return Result.success(status);
    }

    @PostMapping("/sync")
    @Operation(summary = "手动同步一轮（也可用来验连通性）")
    public Result<?> sync(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            return Result.success(syncService.syncAll());
        } catch (Exception e) {
            log.warn("[安维迪] 手动同步失败: {}", e.getMessage());
            return Result.error(readableError(e));
        }
    }

    @GetMapping("/floorplan")
    @Operation(summary = "通道的平面图布局（房间/笼架/点位坐标）")
    public Result<?> floorPlan(@RequestParam(required = false) Long channelId,
                               @RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        JsonNode layout = queryService.floorPlan(channelId);
        if (layout == null) {
            return Result.error("该通道还没有平面图布局（通道未同步到画面 ID，或本地没有对应布局文件）");
        }
        return Result.success(layout);
    }

    @GetMapping("/alarm-rules")
    @Operation(summary = "报警推送的两种口径及其开关/阈值")
    public Result<?> alarmRules(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(alarmService.rules());
    }

    @PutMapping("/alarm-rules/{ruleCode}")
    @Operation(summary = "改某个口径的开关与阈值")
    public Result<?> updateAlarmRule(@PathVariable String ruleCode,
                                     @RequestBody Map<String, Object> body,
                                     @RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        boolean enabled = Boolean.TRUE.equals(body.get("enabled"))
                || "true".equals(String.valueOf(body.get("enabled")));
        Integer threshold = null;
        Object raw = body.get("thresholdCount");
        if (raw instanceof Number n) {
            threshold = n.intValue();
        } else if (raw instanceof String s && !s.isBlank()) {
            threshold = Integer.valueOf(s.trim());
        }
        alarmService.updateRule(ruleCode, enabled, threshold);
        return Result.success();
    }

    @GetMapping("/notify-log")
    @Operation(summary = "最近的报警推送留痕")
    public Result<?> notifyLog(@RequestParam(defaultValue = "50") int limit,
                               @RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(alarmService.notifyLog(limit));
    }

    @PostMapping("/alarm-evaluate")
    @Operation(summary = "手动跑一轮报警判定（不拉数，只按库里现有数据判该不该推）")
    public Result<?> alarmEvaluate(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            return Result.success(alarmService.evaluate());
        } catch (Exception e) {
            log.warn("[安维迪报警] 手动判定失败: {}", e.getMessage());
            return Result.error(readableError(e));
        }
    }

    @PutMapping("/layout-points")
    @Operation(summary = "保存手动摆位（后台拖拽点位后点保存）")
    public Result<?> saveLayoutPoints(@RequestParam Long channelId,
                                      @RequestBody List<Map<String, Object>> body,
                                      @RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        List<AvidityLayoutPoint> rows = new ArrayList<>();
        for (Map<String, Object> item : body) {
            AvidityLayoutPoint row = new AvidityLayoutPoint();
            row.setRoomCode(String.valueOf(item.get("room")));
            row.setRackCode(String.valueOf(item.get("rack")));
            row.setPointNo(asInt(item.get("no")));
            row.setPosX(asInt(item.get("x")));
            row.setPosY(asInt(item.get("y")));
            if (row.getRoomCode() == null || row.getRackCode() == null
                    || row.getPointNo() == null || row.getPosX() == null || row.getPosY() == null) {
                continue;
            }
            rows.add(row);
        }
        return Result.success(queryService.saveLayoutPoints(channelId, rows));
    }

    @DeleteMapping("/layout-points")
    @Operation(summary = "恢复默认版式（清掉该通道的手动摆位）")
    public Result<?> resetLayoutPoints(@RequestParam Long channelId,
                                       @RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(queryService.resetLayoutPoints(channelId));
    }

    private static Integer asInt(Object v) {
        if (v instanceof Number n) return n.intValue();
        if (v instanceof String s && !s.isBlank()) {
            try { return Integer.valueOf(s.trim()); } catch (NumberFormatException e) { return null; }
        }
        return null;
    }

    private Result<?> requireAdmin(String authorization) {
        return requireAdmin(authContextService.resolveUserFromBearer(authorization));
    }

    private Result<?> requireAdmin(User user) {
        if (user == null) {
            return Result.error("未登录或令牌无效");
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            return Result.error("账号已禁用");
        }
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.MEMBER;
        if (role.getLevel() < RoleEnum.ADMIN.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }

    private String readableError(Throwable throwable) {
        Throwable cur = throwable;
        while (cur.getCause() != null) {
            cur = cur.getCause();
        }
        String msg = cur.getMessage();
        return (msg == null || msg.isBlank()) ? "同步失败" : msg;
    }
}
