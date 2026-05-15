package com.example.demo.modules.invite;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/admin/registration-invites")
@Tag(name = "管理端-注册推荐码", description = "教职工注册用短期推荐码（管理员及以上可生成、作废、查看列表）")
public class AdminRegistrationInviteController {

    private final RegistrationInviteService registrationInviteService;

    public AdminRegistrationInviteController(RegistrationInviteService registrationInviteService) {
        this.registrationInviteService = registrationInviteService;
    }

    @GetMapping
    @Operation(summary = "最近推荐码列表（不含明文）")
    public Result<?> list(@RequestParam(defaultValue = "50") int limit, HttpServletRequest request) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) {
            return denied;
        }
        int safe = Math.min(Math.max(limit, 1), 200);
        InviteAdminListResult r = registrationInviteService.listRecentForAdmin(safe);
        if (r.schemaHint() != null) {
            return Result.success(r.items(), r.schemaHint());
        }
        return Result.success(r.items());
    }

    @PostMapping
    @Operation(summary = "生成推荐码（明文仅本次响应返回）")
    public Result<?> create(@RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) {
            return denied;
        }
        int ttlDays = 3;
        int maxUses = 1;
        String note = "";
        if (body != null) {
            if (body.get("ttlDays") instanceof Number n) {
                ttlDays = Math.min(30, Math.max(1, n.intValue()));
            }
            if (body.get("maxUses") instanceof Number n) {
                maxUses = Math.min(100, Math.max(1, n.intValue()));
            }
            if (body.get("note") != null) {
                note = String.valueOf(body.get("note"));
            }
        }
        User admin = (User) request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        try {
            Map<String, Object> data = registrationInviteService.createAdminInvite(admin.getId(), ttlDays, maxUses, note);
            return Result.success(data);
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        } catch (IllegalStateException ex) {
            return Result.error(ex.getMessage());
        }
    }

    @PostMapping("/revoke")
    @Operation(summary = "作废推荐码")
    public Result<?> revoke(@RequestBody Map<String, String> body, HttpServletRequest request) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) {
            return denied;
        }
        String id = body == null ? null : body.get("id");
        if (!StringUtils.hasText(id)) {
            return Result.error("id 必填");
        }
        registrationInviteService.revoke(id.trim());
        return Result.success();
    }

    private Result<?> requireAdmin(HttpServletRequest request) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (!(attr instanceof User u)) {
            return Result.error("当前登录信息无效");
        }
        RoleEnum r = u.getRole() == null ? RoleEnum.STUDENT : u.getRole();
        if (r.getLevel() < RoleEnum.ADMIN.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }
}
