package com.example.demo.modules.notification.push.admin;

import com.example.demo.common.config.ApiAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.notification.push.channel.PushChannel;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/admin/push-dashboard")
public class AdminPushDashboardController {

    private final List<PushChannel> channels;

    public AdminPushDashboardController(List<PushChannel> channels) { this.channels = channels; }

    private Result<?> requireAdmin(HttpServletRequest request) {
        User user = (User) request.getAttribute(ApiAuthInterceptor.CURRENT_USER_ATTR);
        if (user == null || user.getRole().getLevel() < RoleEnum.ADMIN.getLevel()) return Result.error("仅管理员可操作");
        return null;
    }

    @GetMapping("/overview")
    public Result<Map<String, Object>> overview(HttpServletRequest request) {
        Result<?> denied = requireAdmin(request); if (denied != null) return Result.error(denied.getMessage());
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("sent24h", 0); data.put("success24h", 0); data.put("failed24h", 0);
        List<Map<String, Object>> health = new ArrayList<>();
        for (PushChannel ch : channels) {
            health.add(Map.of("channelCode", ch.getCode(), "channelName", ch.getDisplayName(), "enabled", ch.isEnabled()));
        }
        data.put("channelHealth", health);
        return Result.success(data);
    }
}
