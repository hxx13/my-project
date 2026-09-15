package com.example.demo.modules.adminfile;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.adminfile.dto.AdminFileFolderUpsertRequest;
import com.example.demo.modules.auth.entity.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/admin/file-folders")
@Tag(name = "管理端-文件模板文件夹", description = "教职工及以上可整理共享模板目录")
public class AdminFileFolderController {

    private final AdminFileFolderService adminFileFolderService;

    public AdminFileFolderController(AdminFileFolderService adminFileFolderService) {
        this.adminFileFolderService = adminFileFolderService;
    }

    @GetMapping("/tree")
    @Operation(summary = "文件夹树（含文件计数）")
    public Result<List<AdminFileFolder>> tree(HttpServletRequest request) {
        Result<?> denied = requireStaff(request);
        if (denied != null) {
            return cast(denied);
        }
        return Result.success(adminFileFolderService.tree());
    }

    @PostMapping
    @Operation(summary = "新建文件夹")
    public Result<Void> create(@RequestBody(required = false) AdminFileFolderUpsertRequest body,
                               HttpServletRequest request) {
        Result<?> denied = requireStaff(request);
        if (denied != null) {
            return cast(denied);
        }
        try {
            adminFileFolderService.create(
                    body == null ? null : body.getParentId(),
                    body == null ? null : body.getName(),
                    body == null ? null : body.getIcon());
            return Result.success();
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PatchMapping("/{id}")
    @Operation(summary = "更新文件夹（改名/移动/改图标）")
    public Result<AdminFileFolder> update(@PathVariable Long id,
                                          @RequestBody(required = false) AdminFileFolderUpsertRequest body,
                                          HttpServletRequest request) {
        Result<?> denied = requireStaff(request);
        if (denied != null) {
            return cast(denied);
        }
        try {
            return Result.success(adminFileFolderService.update(
                    id,
                    body == null ? null : body.getName(),
                    body == null ? null : body.getParentId(),
                    body == null ? null : body.getIcon()));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "删除文件夹（非空由服务端拒绝）")
    public Result<Void> delete(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireStaff(request);
        if (denied != null) {
            return cast(denied);
        }
        try {
            adminFileFolderService.delete(id);
            return Result.success();
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    private Result<?> requireStaff(HttpServletRequest request) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (!(attr instanceof User u)) {
            return Result.error("当前登录信息无效");
        }
        RoleEnum r = u.getRole() == null ? RoleEnum.MEMBER : u.getRole();
        if (r.getLevel() < RoleEnum.STAFF.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private static <T> Result<T> cast(Result<?> r) {
        return (Result<T>) r;
    }
}
