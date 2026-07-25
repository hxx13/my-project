package com.example.demo.modules.notification.push.digest;

import org.springframework.stereotype.Service;

import java.time.LocalTime;
import java.util.Arrays;

/**
 * 聚合通知配置解析器。
 *
 * <h3>三级优先级</h3>
 * <ol>
 *   <li>用户个性化偏好（user_digest_preference）— 个人覆盖</li>
 *   <li>平台默认模板（notify_digest_default_config）— 管理员配置</li>
 *   <li>兜底即时（返回 null = INSTANT）</li>
 * </ol>
 *
 * <h3>夜间模式</h3>
 * 夜间时段内所有通知强制缓冲（不管 digest_mode），结束时统一发出。
 * 夜间判断见 {@link #isNightTime}，支持跨天（如 22:00 → 08:00）。
 *
 * <h3>溢出策略（仅 SCHEDULED 模式）</h3>
 * 定时聚合有多个时间节点时，溢出策略分为两类：
 * <ul>
 *   <li><b>非最后一个时间节点</b>：固定"滚入下一轮"——错过了等下一班。</li>
 *   <li><b>最后一个时间节点</b>：
 *     <ul>
 *       <li>ROLL_OVER — 滚入下一轮（等明天/下次）</li>
 *       <li>FALLBACK_INSTANT — 聚合转即时（超过截止时间后立即发送）</li>
 *     </ul>
 *   </li>
 * </ul>
 * 仅一个时间节点时，它同时是"第一个"和"最后一个"，两种策略都可选。<br>
 * 截止时间由 overflow_cutoff_time 指定，为空则自动取 schedule_times 最大时间点。
 *
 * @see DigestScheduler 定时聚合调度器
 * @see PushDispatchEngine 推送分叉处（夜间 + 聚合缓冲）
 */
@Service
public class DigestResolutionService {
    private final UserDigestPreferenceMapper userPrefMapper;
    private final NotifyDigestDefaultConfigMapper defaultConfigMapper;

    public DigestResolutionService(UserDigestPreferenceMapper userPrefMapper,
                                   NotifyDigestDefaultConfigMapper defaultConfigMapper) {
        this.userPrefMapper = userPrefMapper;
        this.defaultConfigMapper = defaultConfigMapper;
    }

    /**
     * 解析用户对某通知源的最终聚合配置。
     *
     * @param userId     接收人 ID
     * @param sourceCode 通知源编码（如 PURCHASE_REQUESTED）
     * @return 聚合配置；null = 即时发送（不走缓冲）
     */
    public ResolvedDigestConfig resolve(String userId, String sourceCode) {
        // ① 查个人偏好
        UserDigestPreference pref = userPrefMapper.findByUserAndSource(userId, sourceCode);
        if (pref != null && pref.getEnabled() != null) {
            if (pref.getEnabled() == 0) return null;              // 个人显式关闭 → 即时
            if (pref.getDigestMode() != null && !"INSTANT".equalsIgnoreCase(pref.getDigestMode())) {
                ResolvedDigestConfig cfg = fromPreference(pref);
                return checkFallback(cfg) ? null : cfg;           // FALLBACK_INSTANT 超过截止 → 即时
            }
            if ("INSTANT".equalsIgnoreCase(pref.getDigestMode())) return null;
        }
        // ② 查平台默认
        NotifyDigestDefaultConfig def = defaultConfigMapper.findBySourceCode(sourceCode);
        if (def != null && def.getEnabled() != null && def.getEnabled() == 1
                && def.getDigestMode() != null && !"INSTANT".equalsIgnoreCase(def.getDigestMode())) {
            ResolvedDigestConfig cfg = fromDefault(def);
            return checkFallback(cfg) ? null : cfg;
        }
        // ③ 兜底即时
        return null;
    }

    /**
     * 溢出策略检查：仅 SCHEDULED 模式 + FALLBACK_INSTANT 策略生效。
     * 当前时间超过 overflow_cutoff_time（或自动取的最晚 schedule 时间点） → 返回 true（降级即时）。
     */
    private boolean checkFallback(ResolvedDigestConfig cfg) {
        if (!"FALLBACK_INSTANT".equalsIgnoreCase(cfg.getOverflowStrategy())) return false;
        if (!"SCHEDULED".equalsIgnoreCase(cfg.getDigestMode())) return false;
        // 截止时间：优先 overflow_cutoff_time，否则取 schedule_times 中最大值
        String cutoffStr = cfg.getOverflowCutoffTime();
        if (cutoffStr == null || cutoffStr.isBlank()) {
            if (cfg.getScheduleTimes() == null || cfg.getScheduleTimes().isBlank()) return false;
            cutoffStr = Arrays.stream(cfg.getScheduleTimes().split(","))
                    .map(String::trim).filter(s -> !s.isEmpty())
                    .map(LocalTime::parse).max(LocalTime::compareTo)
                    .map(LocalTime::toString).orElse(null);
        }
        if (cutoffStr == null) return false;
        try {
            return LocalTime.now().isAfter(LocalTime.parse(cutoffStr.trim()));
        } catch (Exception e) {
            return false;
        }
    }

    private ResolvedDigestConfig fromPreference(UserDigestPreference p) {
        ResolvedDigestConfig c = new ResolvedDigestConfig();
        c.setDigestMode(p.getDigestMode());
        c.setScheduleTimes(p.getScheduleTimes());
        c.setOverflowStrategy(p.getOverflowStrategy());
        c.setScheduleDays(p.getScheduleDays());
        c.setHourlyInterval(p.getHourlyInterval());
        c.setNightModeActive(p.getNightModeEnabled() != null && p.getNightModeEnabled() == 1
                && p.getNightStart() != null && p.getNightEnd() != null);
        c.setNightStart(p.getNightStart());
        c.setNightEnd(p.getNightEnd());
        c.setMinutelyInterval(p.getMinutelyInterval());
        c.setOverflowCutoffTime(p.getOverflowCutoffTime());
        return c;
    }

    private ResolvedDigestConfig fromDefault(NotifyDigestDefaultConfig d) {
        ResolvedDigestConfig c = new ResolvedDigestConfig();
        c.setDigestMode(d.getDigestMode());
        c.setScheduleTimes(d.getScheduleTimes());
        c.setOverflowStrategy(d.getOverflowStrategy());
        c.setScheduleDays(d.getScheduleDays());
        c.setHourlyInterval(d.getHourlyInterval());
        c.setNightModeActive(d.getNightModeEnabled() != null && d.getNightModeEnabled() == 1
                && d.getNightStart() != null && d.getNightEnd() != null);
        c.setNightStart(d.getNightStart());
        c.setNightEnd(d.getNightEnd());
        c.setMinutelyInterval(d.getMinutelyInterval());
        c.setOverflowCutoffTime(d.getOverflowCutoffTime());
        return c;
    }

    /**
     * 判断当前时间是否在夜间时段内。
     *
     * @param start 夜间开始 HH:mm
     * @param end   夜间结束 HH:mm
     * @return true = 夜间暂存中，不发即时通知
     *
     * <h4>跨天逻辑</h4>
     * 同一天（如 00:00-06:00）：start &lt; end，now ∈ [start, end) 即为夜间。<br>
     * 跨天（如 22:00-08:00）：start &gt; end，now &ge; start 或 now &lt; end 均为夜间。
     */
    public static boolean isNightTime(String start, String end) {
        if (start == null || end == null) return false;
        try {
            LocalTime nightStart = LocalTime.parse(start);
            LocalTime nightEnd = LocalTime.parse(end);
            LocalTime now = LocalTime.now();
            if (nightStart.isBefore(nightEnd)) {
                // 同一天：如 00:00 → 06:00
                return !now.isBefore(nightStart) && now.isBefore(nightEnd);
            } else {
                // 跨天：如 22:00 → 08:00
                return !now.isBefore(nightStart) || now.isBefore(nightEnd);
            }
        } catch (Exception e) {
            return false;
        }
    }
}
