package com.example.demo.modules.broadcast.service;

import com.example.demo.modules.broadcast.client.DsppaClient;
import com.example.demo.modules.broadcast.dto.PlanRequest;
import com.example.demo.modules.broadcast.entity.BroadcastPlan;
import com.example.demo.modules.broadcast.mapper.BroadcastPlanMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 广播定时播放方案：增删改查 + 到点执行。
 *
 * <p>**调度在我方**：方案存在自己库里，调度器到点下发播放指令，平台只负责出声。
 * 这样绕开平台自带定时引擎的不可靠（实测连续 8 天零播放、且只跑「当前方案」）。
 *
 * <p>时间判断一律用调度基准时间（{@link DsppaClient#scheduleNow()}）= **本机墙钟**。
 * 用户设「9 点」想的是墙上的钟；实测平台自己的钟慢约 3 分钟，拿它当基准只会让定时稳定晚几分钟。
 */
@Service
public class BroadcastPlanService {

    private static final Logger log = LoggerFactory.getLogger(BroadcastPlanService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {
    };
    private static final DateTimeFormatter TIME_FMT = DateTimeFormatter.ofPattern("HH:mm:ss");
    /** 开播时刻过了这么久才算「补播」（服务重启后没赶上的那种）。 */
    private static final long CATCHUP_AFTER_SECONDS = 120;

    /** 上次「是否还在播」巡检时刻，按方案记。重启后丢失只会导致多巡检一次，无副作用。 */
    private final Map<Long, Long> lastResumeCheckAt = new ConcurrentHashMap<>();

    @Value("${app.broadcast.resume-check-ms:60000}")
    private long resumeCheckMs;

    private final BroadcastPlanMapper planMapper;
    private final BroadcastPlayService playService;
    private final DsppaClient client;

    public BroadcastPlanService(BroadcastPlanMapper planMapper,
                                BroadcastPlayService playService,
                                DsppaClient client) {
        this.planMapper = planMapper;
        this.playService = playService;
        this.client = client;
    }

    // ---------------------------------------------------------------- 增删改查

    public List<BroadcastPlan> list() {
        return planMapper.selectAll();
    }

    public BroadcastPlan get(Long id) {
        return planMapper.selectById(id);
    }

    public BroadcastPlan create(PlanRequest req, String operator) {
        BroadcastPlan plan = new BroadcastPlan();
        apply(plan, req);
        plan.setCreatedBy(operator);
        planMapper.insert(plan);
        log.info("[广播] 新建定时方案 #{} {}", plan.getId(), plan.getPlanName());
        return planMapper.selectById(plan.getId());
    }

    public BroadcastPlan update(Long id, PlanRequest req) {
        BroadcastPlan exist = planMapper.selectById(id);
        if (exist == null) {
            throw new IllegalArgumentException("方案不存在");
        }
        BroadcastPlan plan = new BroadcastPlan();
        plan.setId(id);
        apply(plan, req);
        planMapper.update(plan);
        log.info("[广播] 修改定时方案 #{} {}", id, plan.getPlanName());
        return planMapper.selectById(id);
    }

    public void delete(Long id) {
        if (planMapper.selectById(id) == null) {
            throw new IllegalArgumentException("方案不存在");
        }
        planMapper.deleteById(id);
        lastResumeCheckAt.remove(id);
        log.info("[广播] 删除定时方案 #{}", id);
    }

    public BroadcastPlan toggle(Long id, Boolean enabled) {
        if (planMapper.selectById(id) == null) {
            throw new IllegalArgumentException("方案不存在");
        }
        planMapper.toggle(id, enabled == null || enabled);
        return planMapper.selectById(id);
    }

    /** 人工「立刻试跑一次」：等同于到点触发，但记成 MANUAL。 */
    public void runNow(Long id, String operator) {
        BroadcastPlan plan = planMapper.selectById(id);
        if (plan == null) {
            throw new IllegalArgumentException("方案不存在");
        }
        playFirstSong(plan, BroadcastPlayService.SOURCE_MANUAL, operator);
    }

    // ---------------------------------------------------------------- 调度执行

    /**
     * 调度器每轮调一次。做三件事：到点开播、窗口结束收播、播着播着没声了重新下发。
     *
     * <p>无连接时**直接跳过**并留痕，不抛异常 —— 定时任务不应该因为外部设备不在就刷错误日志。
     */
    public List<String> tick() {
        if (!client.isConnected() || !client.isLoggedIn()) {
            log.debug("[广播] 未连接，本轮定时跳过");
            return List.of();
        }
        LocalDateTime now = client.scheduleNow();
        String today = now.toLocalDate().toString();
        LocalTime nowTime = now.toLocalTime();
        List<String> acted = new ArrayList<>();

        for (BroadcastPlan plan : planMapper.selectEnabled()) {
            try {
                if (!matchDay(plan, now.toLocalDate())) {
                    continue;
                }
                LocalTime start = parseTime(plan.getStartTime());
                LocalTime end = parseTime(plan.getEndTime());
                if (start == null || end == null) {
                    log.warn("[广播] 方案 #{} 起止时间不合法，跳过", plan.getId());
                    continue;
                }

                if (!nowTime.isBefore(start) && !nowTime.isAfter(end)) {
                    // 窗口内
                    if (!today.equals(plan.getLastFiredDate())) {
                        String source = nowTime.isAfter(start.plusSeconds(CATCHUP_AFTER_SECONDS))
                                ? BroadcastPlayService.SOURCE_CATCHUP
                                : BroadcastPlayService.SOURCE_SCHEDULE;
                        String msg = playFirstSong(plan, source, null);
                        acted.add("方案「" + plan.getPlanName() + "」开播(" + source + ")：" + msg);
                    } else {
                        String msg = resumeIfSilent(plan);
                        if (msg != null) {
                            acted.add("方案「" + plan.getPlanName() + "」重新下发：" + msg);
                        }
                    }
                } else if (nowTime.isAfter(end)) {
                    // 窗口已过：当天开播过的，收一次播
                    if (today.equals(plan.getLastFiredDate()) && !today.equals(plan.getLastStopDate())) {
                        stopPlan(plan);
                        acted.add("方案「" + plan.getPlanName() + "」收播");
                    }
                }
            } catch (Exception e) {
                // 单个方案出错不能拖垮整轮
                log.warn("[广播] 方案 #{} 处理失败: {}", plan.getId(), e.getMessage());
            }
        }
        return acted;
    }

    /** 到点开播：播方案曲目列表的**第一首**，后续由平台按列表续播。 */
    private String playFirstSong(BroadcastPlan plan, String source, String operator) {
        List<String> macs = readList(plan.getZoneMacs());
        List<String> songs = readList(plan.getSongPaths());
        if (macs.isEmpty()) {
            throw new IllegalArgumentException("方案未配置目标分区");
        }
        if (songs.isEmpty()) {
            throw new IllegalArgumentException("方案未配置曲目");
        }
        String first = songs.get(0);
        playService.play(macs, first, plan.getVolume(), source, plan, operator);
        planMapper.markFired(plan.getId(),
                client.scheduleNow().toLocalDate().toString(),
                client.scheduleNow(),
                "已开播，首曲：" + first);
        plan.setLastFiredDate(client.scheduleNow().toLocalDate().toString());
        lastResumeCheckAt.put(plan.getId(), System.currentTimeMillis());
        return first;
    }

    private void stopPlan(BroadcastPlan plan) {
        List<String> macs = readList(plan.getZoneMacs());
        if (macs.isEmpty()) {
            return;
        }
        playService.stop(macs, BroadcastPlayService.SOURCE_SCHEDULE, plan, null);
        planMapper.markStopped(plan.getId(), client.scheduleNow().toLocalDate().toString());
        plan.setLastStopDate(client.scheduleNow().toLocalDate().toString());
        lastResumeCheckAt.remove(plan.getId());
    }

    /**
     * 「播着播着没声了」的兜底：隔一段时间看一眼目标分区到底还在不在播，不在就重新下发。
     *
     * <p>现场反馈原平台「时好时坏」，这一条就是针对它 —— 不假定下发一次就万事大吉。
     *
     * @return 重新下发时的说明；没做事返回 null
     */
    private String resumeIfSilent(BroadcastPlan plan) {
        long nowMs = System.currentTimeMillis();
        Long last = lastResumeCheckAt.get(plan.getId());
        if (last != null && nowMs - last < resumeCheckMs) {
            return null;
        }
        lastResumeCheckAt.put(plan.getId(), nowMs);

        List<String> macs = readList(plan.getZoneMacs());
        List<String> songs = readList(plan.getSongPaths());
        if (macs.isEmpty() || songs.isEmpty()) {
            return null;
        }
        try {
            boolean anyPlaying = client.fetchZones().stream()
                    .filter(z -> macs.contains(String.valueOf(z.get("mac"))))
                    .anyMatch(z -> toInt(z.get("play_status"), -1) == 1);
            if (anyPlaying) {
                return null;
            }
            log.warn("[广播] 方案 #{} 窗口内但目标分区未在播放，重新下发", plan.getId());
            playService.play(macs, songs.get(0), plan.getVolume(),
                    BroadcastPlayService.SOURCE_CATCHUP, plan, null);
            return "检测到未在播放，已重新下发";
        } catch (Exception e) {
            log.warn("[广播] 方案 #{} 巡检失败: {}", plan.getId(), e.getMessage());
            return null;
        }
    }

    /** 今天是否匹配该方案的定时日。 */
    private boolean matchDay(BroadcastPlan plan, LocalDate today) {
        if (plan.getTimeMode() != null && plan.getTimeMode() == 1) {
            String from = plan.getStartDate();
            String to = plan.getEndDate();
            if (from == null || from.isBlank() || to == null || to.isBlank()) {
                return false;
            }
            String t = today.toString();
            return t.compareTo(from) >= 0 && t.compareTo(to) <= 0;
        }
        String days = plan.getWeekDays();
        if (days == null || days.isBlank()) {
            return false;
        }
        return days.indexOf(String.valueOf(today.getDayOfWeek().getValue())) >= 0;
    }

    // ---------------------------------------------------------------- 校验与赋值

    private void apply(BroadcastPlan plan, PlanRequest req) {
        if (req == null) {
            throw new IllegalArgumentException("缺少方案内容");
        }
        String name = req.planName() == null ? "" : req.planName().trim();
        if (name.isEmpty()) {
            throw new IllegalArgumentException("方案名称不能为空");
        }
        LocalTime start = parseTime(req.startTime());
        LocalTime end = parseTime(req.endTime());
        if (start == null) {
            throw new IllegalArgumentException("开始时间必须形如 HH:mm:ss");
        }
        if (end == null) {
            throw new IllegalArgumentException("结束时间必须形如 HH:mm:ss");
        }
        if (!start.isBefore(end)) {
            throw new IllegalArgumentException("结束时间必须晚于开始时间");
        }
        int timeMode = req.timeMode() == null ? 0 : req.timeMode();
        if (timeMode == 1) {
            if (isBlank(req.startDate()) || isBlank(req.endDate())) {
                throw new IllegalArgumentException("按日期循环必须填写起止日期");
            }
            if (req.startDate().compareTo(req.endDate()) > 0) {
                throw new IllegalArgumentException("结束日期不能早于开始日期");
            }
        } else if (isBlank(req.weekDays())) {
            throw new IllegalArgumentException("请至少选择一个星期");
        }
        if (req.zoneMacs() == null || req.zoneMacs().isEmpty()) {
            throw new IllegalArgumentException("请至少选择一个目标分区");
        }
        if (req.songPaths() == null || req.songPaths().isEmpty()) {
            throw new IllegalArgumentException("请至少选择一首曲目");
        }
        if (req.volume() != null && (req.volume() < 0 || req.volume() > 100)) {
            throw new IllegalArgumentException("音量必须在 0-100 之间");
        }

        plan.setPlanName(name);
        plan.setEnabled(req.enabled() == null || req.enabled());
        plan.setTimeMode(timeMode);
        plan.setWeekDays(req.weekDays());
        plan.setStartDate(req.startDate());
        plan.setEndDate(req.endDate());
        plan.setStartTime(start.format(TIME_FMT));
        plan.setEndTime(end.format(TIME_FMT));
        plan.setVolume(req.volume());
        plan.setZoneMacs(writeJson(req.zoneMacs()));
        plan.setSongPaths(writeJson(req.songPaths()));
        plan.setSongListId(req.songListId());
    }

    private static LocalTime parseTime(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return LocalTime.parse(raw.trim(), TIME_FMT);
        } catch (Exception e) {
            return null;
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    static List<String> readList(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            List<String> v = MAPPER.readValue(json, STRING_LIST);
            return v == null ? List.of() : v;
        } catch (Exception e) {
            return List.of();
        }
    }

    private static String writeJson(List<String> list) {
        try {
            return MAPPER.writeValueAsString(list);
        } catch (Exception e) {
            return "[]";
        }
    }

    private static int toInt(Object o, int fallback) {
        if (o instanceof Number n) {
            return n.intValue();
        }
        if (o instanceof String s) {
            try {
                return Integer.parseInt(s.trim());
            } catch (Exception ignored) {
                return fallback;
            }
        }
        return fallback;
    }
}
