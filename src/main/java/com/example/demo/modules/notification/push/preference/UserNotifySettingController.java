package com.example.demo.modules.notification.push.preference;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.modules.auth.entity.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 个人通知偏好 API（Web 管理端 + 小程序 / 移动端通用）。
 * <p>
 * GET  /api/user/notify-settings         — 列出所有源 + 当前用户偏好
 * PUT  /api/user/notify-settings/{code}  — 保存当前用户对某个源的偏好
 */
@RestController
@RequestMapping("/api/user/notify-settings")
@Tag(name = "个人通知偏好", description = "用户视角：自主开关信息源和渠道")
public class UserNotifySettingController {

    private final UserNotifySettingService service;

    public UserNotifySettingController(UserNotifySettingService service) {
        this.service = service;
    }

    /** 获取当前登录用户的 ID */
    private String currentUserId(HttpServletRequest request) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (attr instanceof User u) return u.getId();
        return "UNKNOWN";
    }
    private String currentUserRole(HttpServletRequest request) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (attr instanceof User u) return u.getRole() != null ? u.getRole().getCode() : "ALL";
        return "ALL";
    }

    @GetMapping
    @Operation(summary = "列出当前用户可看到的信息源及偏好设置")
    public Result<List<UserNotifySettingService.SourceSetting>> list(HttpServletRequest request) {
        String userId = currentUserId(request);
        String role = currentUserRole(request);
        return Result.success(service.listForUser(userId, role));
    }

    @PutMapping("/{sourceCode}")
    @Operation(summary = "保存当前用户对某个信息源的偏好")
    public Result<Void> save(@PathVariable String sourceCode,
                              @RequestBody UserNotifyMute body,
                              HttpServletRequest request) {
        String userId = currentUserId(request);
        service.save(userId, sourceCode, body);
        return Result.success();
    }
}
