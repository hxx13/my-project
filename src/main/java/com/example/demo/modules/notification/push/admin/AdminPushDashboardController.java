package com.example.demo.modules.notification.push.admin;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.notification.mapper.NotificationMiniProgramMapper;
import com.example.demo.modules.notification.push.channel.PushChannel;
import com.example.demo.modules.notification.push.digest.NotifyDigestDefaultConfigMapper;
import com.example.demo.modules.notification.push.digest.NotifyDigestItemMapper;
import com.example.demo.modules.notification.push.source.NotifySourceService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;

@RestController
@RequestMapping("/api/admin/push-dashboard")
public class AdminPushDashboardController {

    private final NotifySourceService sourceService;
    private final NotificationMiniProgramMapper logMapper;
    private final List<PushChannel> channels;
    private final NotifyDigestDefaultConfigMapper digestDefaultMapper;
    private final NotifyDigestItemMapper digestItemMapper;
    private final JdbcTemplate jdbcTemplate;

    public AdminPushDashboardController(NotifySourceService sourceService,
                                         NotificationMiniProgramMapper logMapper,
                                         List<PushChannel> channels,
                                         NotifyDigestDefaultConfigMapper digestDefaultMapper,
                                         NotifyDigestItemMapper digestItemMapper,
                                         JdbcTemplate jdbcTemplate) {
        this.sourceService = sourceService;
        this.logMapper = logMapper;
        this.channels = channels;
        this.digestDefaultMapper = digestDefaultMapper;
        this.digestItemMapper = digestItemMapper;
        this.jdbcTemplate = jdbcTemplate;
    }

    private Result<?> requireAdmin(HttpServletRequest request) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (!(attr instanceof User user)) return Result.error("当前登录信息无效");
        if (user.getRole().getLevel() < RoleEnum.ADMIN.getLevel()) return Result.error("无权限访问");
        return null;
    }

    @GetMapping("/overview")
    public Result<Map<String, Object>> overview(HttpServletRequest request) {
        Result<?> denied = requireAdmin(request); if (denied != null) return Result.error(denied.getMessage());

        var sources = sourceService.listAll();
        long enabledSources = sources.stream().filter(s -> s.getEnabled() != null && s.getEnabled() == 1).count();

        Map<String, Object> stats = logMapper.getPushStats(LocalDateTime.now().minusHours(24));
        long sent24h = stats != null && stats.get("sent24h") != null ? ((Number) stats.get("sent24h")).longValue() : 0;
        long success24h = stats != null && stats.get("success24h") != null ? ((Number) stats.get("success24h")).longValue() : 0;
        long failed24h = stats != null && stats.get("failed24h") != null ? ((Number) stats.get("failed24h")).longValue() : 0;

        List<Map<String, Object>> healthList = new ArrayList<>();
        List<Map<String, Object>> chHealth = logMapper.getChannelHealth(10);
        Map<String, Map<String, Object>> healthMap = new LinkedHashMap<>();
        if (chHealth != null) {
            for (Map<String, Object> h : chHealth) {
                healthMap.put((String) h.get("channel"), h);
            }
        }
        for (PushChannel ch : channels) {
            Map<String, Object> h = healthMap.getOrDefault(ch.getCode(), new HashMap<>());
            long failed10min = h.get("failed") != null ? ((Number) h.get("failed")).longValue() : 0;
            String status = ch.isEnabled() ? (failed10min > 50 ? "degraded" : "healthy") : "paused";
            healthList.add(Map.of(
                "channelCode", ch.getCode(),
                "channelName", ch.getDisplayName(),
                "enabled", ch.isEnabled(),
                "status", status,
                "failed10min", failed10min
            ));
        }

        // 聚合通知统计
        var digestConfigs = digestDefaultMapper.findAll();
        long digestEnabledSources = digestConfigs.stream()
                .filter(d -> d.getEnabled() != null && d.getEnabled() == 1 && !"INSTANT".equalsIgnoreCase(d.getDigestMode()))
                .count();
        long nightModeSources = digestConfigs.stream()
                .filter(d -> d.getNightModeEnabled() != null && d.getNightModeEnabled() == 1)
                .count();
        List<String> pendingUsers = digestItemMapper.findDistinctPendingUsers();
        int pendingUsersCount = pendingUsers.size();
        Long pendingItemsCount = null;
        try {
            pendingItemsCount = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM notify_digest_item WHERE status = 'PENDING'", Long.class);
        } catch (Exception ignored) {}

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("totalSources", sources.size());
        data.put("enabledSources", enabledSources);
        data.put("sent24h", sent24h);
        data.put("success24h", success24h);
        data.put("failed24h", failed24h);
        data.put("channelHealth", healthList);
        // 聚合数据
        data.put("digestEnabledSources", digestEnabledSources);
        data.put("nightModeSources", nightModeSources);
        data.put("pendingDigestUsers", pendingUsersCount);
        data.put("pendingDigestItems", pendingItemsCount != null ? pendingItemsCount : 0);
        return Result.success(data);
    }

    /** 聚合缓冲明细：待发条目 + 每条对应的 schedule 信息 */
    @GetMapping("/digest-pending")
    public Result<List<Map<String, Object>>> digestPending(HttpServletRequest request) {
        Result<?> denied = requireAdmin(request); if (denied != null) return Result.error(denied.getMessage());
        String sql = """
            SELECT d.id, d.user_id, d.source_code, d.channel_code, d.title, d.content, d.create_time,
                   COALESCE(ap.name, su.display_nickname, su.username, d.user_id) AS user_name
            FROM notify_digest_item d
            LEFT JOIN aro_personnel ap ON ap.user_id = d.user_id
            LEFT JOIN sys_user su ON su.id = d.user_id
            WHERE d.status = 'PENDING'
            ORDER BY d.create_time DESC
            LIMIT 200
            """;
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql);
            // 补充每个源的 schedule 信息
            var configs = digestDefaultMapper.findAll();
            Map<String, Map<String, Object>> configMap = new LinkedHashMap<>();
            for (var c : configs) {
                Map<String, Object> ci = new LinkedHashMap<>();
                ci.put("scheduleTimes", c.getScheduleTimes());
                ci.put("digestMode", c.getDigestMode());
                ci.put("hourlyInterval", c.getHourlyInterval() != null ? c.getHourlyInterval() : 1);
                ci.put("minutelyInterval", c.getMinutelyInterval() != null ? c.getMinutelyInterval() : 5);
                configMap.put(c.getSourceCode(), ci);
            }
            for (Map<String, Object> row : rows) {
                String sc = (String) row.get("source_code");
                Map<String, Object> ci = configMap.get(sc);
                if (ci != null) {
                    row.put("schedule_times", ci.get("scheduleTimes"));
                    row.put("digest_mode", ci.get("digestMode"));
                    row.put("hourly_interval", ci.get("hourlyInterval"));
                    row.put("minutely_interval", ci.get("minutelyInterval"));
                }
            }
            return Result.success(rows);
        } catch (Exception e) {
            return Result.error("查询聚合缓冲失败: " + e.getMessage());
        }
    }
}
