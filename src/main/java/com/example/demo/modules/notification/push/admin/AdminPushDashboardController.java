package com.example.demo.modules.notification.push.admin;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.notification.mapper.NotificationMiniProgramMapper;
import com.example.demo.modules.notification.push.channel.PushChannel;
import com.example.demo.modules.notification.push.source.NotifySourceService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;

@RestController
@RequestMapping("/api/admin/push-dashboard")
public class AdminPushDashboardController {

    private final NotifySourceService sourceService;
    private final NotificationMiniProgramMapper logMapper;
    private final List<PushChannel> channels;

    public AdminPushDashboardController(NotifySourceService sourceService,
                                         NotificationMiniProgramMapper logMapper,
                                         List<PushChannel> channels) {
        this.sourceService = sourceService;
        this.logMapper = logMapper;
        this.channels = channels;
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

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("totalSources", sources.size());
        data.put("enabledSources", enabledSources);
        data.put("sent24h", sent24h);
        data.put("success24h", success24h);
        data.put("failed24h", failed24h);
        data.put("channelHealth", healthList);
        return Result.success(data);
    }
}
