package com.example.demo.modules.twin.service;

import com.example.demo.modules.aro.mapper.AroDatabaseMapper;
import com.example.demo.modules.dahua.mapper.DahuaDeviceChannelCacheMapper;
import com.example.demo.modules.twin.entity.TwinAutomationDisplayMap;
import com.example.demo.modules.twin.entity.TwinAutomationLog;
import com.example.demo.modules.twin.mapper.TwinAutomationDisplayMapMapper;
import com.example.demo.modules.twin.mapper.TwinAutomationLogMapper;
import com.example.demo.modules.twin.support.TwinAutomationLogDetailHumanizer;
import com.example.demo.modules.twin.support.TwinAutomationLogDisplayHelper;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class TwinAutomationLogService {
    public static final String TYPE_AUTO_SIGNOUT = "AUTO_SIGNOUT";
    public static final String TYPE_SCHEDULER = "SCHEDULER";
    public static final String TYPE_EXEMPTION = "EXEMPTION";
    /** 扫码/大华联动关键步骤（便于溯源，不写高频 analyze） */
    public static final String TYPE_ACCESS_TRACE = "ACCESS_TRACE";

    /** 滞留跑批：单用户大华物理冻结成功（与 RUN_REAPER 汇总行区分） */
    public static final String EVENT_REAPER_USER_FROZEN = "REAPER_USER_FROZEN";
    public static final String TRIGGER_REAPER_USER_FROZEN = "REAPER_USER_FROZEN";

    /** 扫码下发成功后：待激活门禁倒计时开始（初次计时） */
    public static final String SWING_PENDING_ACTIVATION_TIMER_START = "SWING_PENDING_ACTIVATION_TIMER_START";
    /** 历史码：与 {@link #SWING_PENDING_ACTIVATION_TIMER_START} 同义，列表展示合并 */
    public static final String SWING_ENTER_PENDING_ACTIVATION = "SWING_ENTER_PENDING_ACTIVATION";
    /** 激活卡片规则门刷卡：激活成功 */
    public static final String SWING_ACTIVATION_CARD_SUCCESS = "SWING_ACTIVATION_CARD_SUCCESS";
    /** 历史码：与 {@link #SWING_ACTIVATION_CARD_SUCCESS} 同义 */
    public static final String SWING_TOGGLE_ACTIVATED = "SWING_TOGGLE_ACTIVATED";
    /** 刷「刷门即签退」门组后排程延时签退计时 */
    public static final String SWING_EXIT_DELAY_TIMER_STARTED = "SWING_EXIT_DELAY_TIMER_STARTED";
    /** 「激活后再次刷门签退」门组命中后排程延时签退计时 */
    public static final String SWING_ACTIVATED_RESWIPE_EXIT_TIMER_STARTED = "SWING_ACTIVATED_RESWIPE_EXIT_TIMER_STARTED";
    /** 定时到期：待激活窗口超期，即将自动签退 */
    public static final String SWING_AUTO_LEAVE_DUE_PENDING_ACTIVATION = "SWING_AUTO_LEAVE_DUE_PENDING_ACTIVATION";
    /** 定时到期：刷门延时签退时刻到，即将自动签退 */
    public static final String SWING_AUTO_LEAVE_DUE_EXIT_DELAY = "SWING_AUTO_LEAVE_DUE_EXIT_DELAY";
    /** 定时到期：已激活宽限（历史数据）到期，即将自动签退 */
    public static final String SWING_AUTO_LEAVE_DUE_ACTIVATED_SLA = "SWING_AUTO_LEAVE_DUE_ACTIVATED_SLA";

    private final TwinAutomationLogMapper mapper;
    private final JobExecutionRegistry jobExecutionRegistry;
    private final TwinAutomationDisplayMapMapper displayMapMapper;
    private final DahuaDeviceChannelCacheMapper dahuaDeviceChannelCacheMapper;
    private final AroDatabaseMapper aroDatabaseMapper;

    public TwinAutomationLogService(
            TwinAutomationLogMapper mapper,
            @Lazy JobExecutionRegistry jobExecutionRegistry,
            TwinAutomationDisplayMapMapper displayMapMapper,
            DahuaDeviceChannelCacheMapper dahuaDeviceChannelCacheMapper,
            AroDatabaseMapper aroDatabaseMapper
    ) {
        this.mapper = mapper;
        this.jobExecutionRegistry = jobExecutionRegistry;
        this.displayMapMapper = displayMapMapper;
        this.dahuaDeviceChannelCacheMapper = dahuaDeviceChannelCacheMapper;
        this.aroDatabaseMapper = aroDatabaseMapper;
    }

    /**
     * 写入一条自动化审计日志。
     *
     * @param automationType 业务大类，建议使用本类 TYPE_* 常量（库存仍为英文码便于检索）
     * @param eventKey       子事件键，如 RUN_REAPER、AUTO_SIGNOUT_EXEC
     * @param triggerType    触发方式：TIMER / MANUAL / SYSTEM
     * @param triggerReason  触发原因码（库存英文）；列表展示时会映射为中文
     * @param userId         关联用户 id，无则 null
     * @param targetId       关联目标（如 jobKey），无则 null
     * @param success        是否成功
     * @param detail         人类可读说明，推荐直接写中文，可附关键 ID（如 roomId=…）
     * @param createdBy      写入来源标识（如 job-run-reaper）
     */
    public void write(
            String automationType,
            String eventKey,
            String triggerType,
            String triggerReason,
            String userId,
            String targetId,
            boolean success,
            String detail,
            String createdBy
    ) {
        try {
            TwinAutomationLog row = new TwinAutomationLog();
            row.setAutomationType(cut(automationType, 32));
            row.setEventKey(cut(eventKey, 128));
            row.setTriggerType(cut(triggerType, 32));
            row.setTriggerReason(cut(triggerReason, 255));
            row.setUserId(cut(userId, 64));
            row.setTargetId(cut(targetId, 128));
            row.setSuccess(success ? 1 : 0);
            row.setDetail(cut(detail, 4000));
            row.setEventTime(LocalDateTime.now());
            row.setCreatedBy(cut(createdBy, 64));
            mapper.insert(row);
        } catch (Exception ignored) {
            // 自动化日志不阻断主业务
        }
    }

    /**
     * 同 {@link #write}，返回自增主键（失败时返回 null），供进出流水溯源匹配。
     */
    public Long writeReturningId(
            String automationType,
            String eventKey,
            String triggerType,
            String triggerReason,
            String userId,
            String targetId,
            boolean success,
            String detail,
            String createdBy
    ) {
        try {
            TwinAutomationLog row = new TwinAutomationLog();
            row.setAutomationType(cut(automationType, 32));
            row.setEventKey(cut(eventKey, 128));
            row.setTriggerType(cut(triggerType, 32));
            row.setTriggerReason(cut(triggerReason, 255));
            row.setUserId(cut(userId, 64));
            row.setTargetId(cut(targetId, 128));
            row.setSuccess(success ? 1 : 0);
            row.setDetail(cut(detail, 4000));
            row.setEventTime(LocalDateTime.now());
            row.setCreatedBy(cut(createdBy, 64));
            mapper.insert(row);
            return row.getId();
        } catch (Exception ignored) {
            return null;
        }
    }

    public Map<String, Object> listPage(
            String automationType,
            String triggerType,
            String keyword,
            LocalDateTime startTime,
            LocalDateTime endTime,
            int page,
            int pageSize,
            Boolean excludePenetrationPoll
    ) {
        int safePage = Math.max(1, page);
        int safeSize = Math.min(200, Math.max(10, pageSize));
        int offset = (safePage - 1) * safeSize;
        boolean hidePen = excludePenetrationPoll == null || excludePenetrationPoll;
        List<TwinAutomationLog> list = mapper.selectPage(
                blankToNull(automationType),
                blankToNull(triggerType),
                blankToNull(keyword),
                startTime,
                endTime,
                hidePen,
                offset,
                safeSize
        );
        long total = mapper.countPage(
                blankToNull(automationType),
                blankToNull(triggerType),
                blankToNull(keyword),
                startTime,
                endTime,
                hidePen
        );
        Map<String, Map<String, String>> overrides = TwinAutomationLogDisplayHelper.toOverrideBucketsFromEntities(safeListDisplayMaps());
        Map<String, String> jobNames = jobExecutionRegistry.jobNameMap();
        for (TwinAutomationLog row : list) {
            TwinAutomationLogDisplayHelper.applyLabels(row, jobNames, overrides);
        }
        enrichDetailDisplay(list);
        Map<String, Object> out = new HashMap<>();
        out.put("list", list);
        out.put("total", total);
        out.put("page", safePage);
        out.put("pageSize", safeSize);
        return out;
    }

    /**
     * 大屏/流水弹窗：按用户与时间点拉取附近自动化审计（已套中文标签与 detail 展开）。
     */
    public List<TwinAutomationLog> listNearForUser(String userId, LocalDateTime anchor, int windowMinutes, int limit, Boolean excludePenetrationPoll) {
        if (userId == null || userId.isBlank() || anchor == null) {
            return List.of();
        }
        int w = Math.min(24 * 60, Math.max(5, windowMinutes));
        int lim = Math.min(50, Math.max(1, limit));
        LocalDateTime from = anchor.minusMinutes(w);
        LocalDateTime to = anchor.plusMinutes(w);
        boolean hidePen = excludePenetrationPoll == null || excludePenetrationPoll;
        List<TwinAutomationLog> list = mapper.selectNearUserTime(userId.trim(), from, to, hidePen, lim);
        if (list == null || list.isEmpty()) {
            return List.of();
        }
        Map<String, Map<String, String>> overrides = TwinAutomationLogDisplayHelper.toOverrideBucketsFromEntities(safeListDisplayMaps());
        Map<String, String> jobNames = jobExecutionRegistry.jobNameMap();
        for (TwinAutomationLog row : list) {
            TwinAutomationLogDisplayHelper.applyLabels(row, jobNames, overrides);
        }
        enrichDetailDisplay(list);
        return list;
    }

    private void enrichDetailDisplay(List<TwinAutomationLog> list) {
        if (list == null || list.isEmpty()) {
            return;
        }
        Set<String> channelCodes = new LinkedHashSet<>();
        Set<String> roomIds = new LinkedHashSet<>();
        for (TwinAutomationLog row : list) {
            if (row == null) {
                continue;
            }
            String d = row.getDetail();
            if (d == null || d.isBlank()) {
                continue;
            }
            channelCodes.addAll(TwinAutomationLogDetailHumanizer.extractChannelCodes(d));
            roomIds.addAll(TwinAutomationLogDetailHumanizer.extractRoomIds(d));
        }
        Map<String, String> channelMap = new HashMap<>();
        if (!channelCodes.isEmpty()) {
            List<String> codes = new ArrayList<>(channelCodes);
            List<Map<String, Object>> rows = dahuaDeviceChannelCacheMapper.selectChannelNamesByCodes(codes);
            if (rows != null) {
                for (Map<String, Object> m : rows) {
                    if (m == null) {
                        continue;
                    }
                    Object c = m.get("channelCode");
                    Object n = m.get("channelName");
                    if (c != null && n != null) {
                        channelMap.put(String.valueOf(c), String.valueOf(n));
                    }
                }
            }
        }
        channelMap = TwinAutomationLogDetailHumanizer.mergeBuiltinChannelLabels(channelMap);

        Map<String, String> roomMap = new HashMap<>();
        if (!roomIds.isEmpty()) {
            List<Map<String, Object>> rrows = aroDatabaseMapper.selectLatestRoomNamesByRoomIds(new ArrayList<>(roomIds));
            if (rrows != null) {
                for (Map<String, Object> m : rrows) {
                    if (m == null) {
                        continue;
                    }
                    Object id = m.get("roomId");
                    Object nm = m.get("roomName");
                    if (id != null && nm != null && !String.valueOf(nm).isBlank()) {
                        roomMap.put(String.valueOf(id), String.valueOf(nm).trim());
                    }
                }
            }
        }
        TwinAutomationLogDetailHumanizer.applyDetailDisplayZh(list, channelMap, roomMap);
    }

    private List<TwinAutomationDisplayMap> safeListDisplayMaps() {
        try {
            List<TwinAutomationDisplayMap> rows = displayMapMapper.selectAll();
            return rows != null ? rows : List.of();
        } catch (Exception e) {
            return List.of();
        }
    }

    private static String blankToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    private static String cut(String s, int maxLen) {
        if (s == null) return null;
        String t = s.trim();
        if (t.length() <= maxLen) return t;
        return t.substring(0, maxLen);
    }
}
