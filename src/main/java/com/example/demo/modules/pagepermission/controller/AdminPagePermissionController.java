package com.example.demo.modules.pagepermission.controller;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.pagepermission.dto.BatchUpdatePagePermissionRequest;
import com.example.demo.modules.pagepermission.dto.UpdatePagePermissionRequest;
import com.example.demo.modules.pagepermission.service.PagePermissionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/admin/page-permissions")
@Tag(name = "页面权限", description = "页面与入口可视化权限配置")
public class AdminPagePermissionController {
    private final PagePermissionService service;

    public AdminPagePermissionController(PagePermissionService service) {
        this.service = service;
    }

    @GetMapping("/tree")
    @Operation(summary = "查询平台权限树")
    public Result<?> tree(@RequestParam String platform, HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return denied;
        return Result.success(service.listTreeByPlatform(platform));
    }

    @GetMapping("/lookup")
    @Operation(summary = "按路径解析权限节点（侧栏右键快捷改权；优先侧栏 ENTRY）")
    public Result<?> lookup(@RequestParam String platform,
                            @RequestParam String path,
                            HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return denied;
        Map<String, Object> data = service.lookupByPlatformAndPath(platform, path);
        if (data == null) {
            return Result.error("未找到对应权限节点。请在「页面权限设置」中点击「重新扫描」后再试。");
        }
        return Result.success(data);
    }

    @PostMapping("/scan")
    @Operation(summary = "触发重新扫描")
    public Result<?> scan(HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return denied;
        return Result.success(service.scanAll());
    }

    @PatchMapping("/{nodeKey}")
    @Operation(summary = "更新单个权限项")
    public Result<?> updateOne(@PathVariable String nodeKey,
                               @RequestBody UpdatePagePermissionRequest req,
                               HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return denied;
        return service.updateOne(nodeKey, req)
                ? Result.success()
                : Result.error("更新失败：节点不存在，或最小角色低于父级页面要求");
    }

    @PostMapping("/batch")
    @Operation(summary = "批量更新权限项")
    public Result<?> batch(@RequestBody BatchUpdatePagePermissionRequest req, HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return denied;
        return Result.success(service.batchUpdate(req));
    }

    @PostMapping("/reset-defaults")
    @Operation(summary = "按平台重置默认权限")
    public Result<?> resetDefaults(@RequestParam String platform, HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return denied;
        return Result.success(service.resetDefaults(platform));
    }

    private Result<?> requireSuperAdmin(HttpServletRequest request) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (!(attr instanceof User currentUser)) {
            return Result.error("当前登录信息无效");
        }
        RoleEnum role = currentUser.getRole() == null ? RoleEnum.STUDENT : currentUser.getRole();
        if (role.getLevel() < RoleEnum.SUPER_ADMIN.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }
}

