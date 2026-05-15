package com.example.demo.modules.mp.controller;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.mp.dto.MpAnnouncementAdminView;
import com.example.demo.modules.mp.dto.MpAnnouncementUpsertRequest;
import com.example.demo.modules.mp.service.MiniProgramAnnouncementService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/admin/mp-announcements")
@Tag(name = "管理端-小程序公告", description = "ADMIN 及以上；body_html 服务端 Jsoup 消毒")
public class AdminMpAnnouncementController {

    private final MiniProgramAnnouncementService announcementService;

    public AdminMpAnnouncementController(MiniProgramAnnouncementService announcementService) {
        this.announcementService = announcementService;
    }

    @GetMapping
    @Operation(summary = "公告列表（含下线）")
    public Result<List<MpAnnouncementAdminView>> list(HttpServletRequest request) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) {
            return cast(denied);
        }
        return Result.success(announcementService.listAdmin());
    }

    @GetMapping("/{id}")
    @Operation(summary = "单条详情")
    public Result<MpAnnouncementAdminView> get(@PathVariable String id, HttpServletRequest request) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) {
            return cast(denied);
        }
        MpAnnouncementAdminView v = announcementService.getAdmin(id);
        if (v == null) {
            return Result.error("记录不存在");
        }
        return Result.success(v);
    }

    @PostMapping
    @Operation(summary = "新建")
    public Result<MpAnnouncementAdminView> create(@RequestBody MpAnnouncementUpsertRequest body,
                                                    HttpServletRequest request) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) {
            return cast(denied);
        }
        User u = current(request);
        try {
            return Result.success(announcementService.create(u, body));
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        }
    }

    @PutMapping("/{id}")
    @Operation(summary = "更新")
    public Result<MpAnnouncementAdminView> update(@PathVariable String id,
                                                   @RequestBody MpAnnouncementUpsertRequest body,
                                                   HttpServletRequest request) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) {
            return cast(denied);
        }
        try {
            return Result.success(announcementService.update(id, body));
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "删除")
    public Result<Void> delete(@PathVariable String id, HttpServletRequest request) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) {
            return cast(denied);
        }
        try {
            announcementService.delete(id);
            return Result.success();
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        }
    }

    private static User current(HttpServletRequest request) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        return attr instanceof User u ? u : null;
    }

    private static Result<?> requireAdmin(HttpServletRequest request) {
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

    @SuppressWarnings("unchecked")
    private static <T> Result<T> cast(Result<?> r) {
        return (Result<T>) r;
    }
}
