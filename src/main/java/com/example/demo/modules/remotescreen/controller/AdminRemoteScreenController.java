package com.example.demo.modules.remotescreen.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.remotescreen.service.RemoteScreenRegistry;
import com.example.demo.modules.remotescreen.service.RemoteScreenSocketService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 远程控制网页屏幕（ADMIN 及以上）。
 *
 * <p>用途：在手机上（小程序）指挥某一台正在展示本网站的电脑切到指定页面。
 * 屏幕靠**标签页自己生成的编号 + 用户起的中文名**辨认，小程序里按名字点名。
 *
 * <p>前缀 /api/admin/** 已有管理员闸门，方法内再自守一道（仓库惯例）。
 */
@RestController
@RequestMapping("/api/admin/screens")
@Tag(name = "远程屏幕", description = "列出在线网页屏幕并让其跳转到指定路由")
public class AdminRemoteScreenController {

    private final RemoteScreenRegistry registry;
    private final RemoteScreenSocketService socketService;
    private final AuthContextService authContextService;

    public AdminRemoteScreenController(RemoteScreenRegistry registry,
                                       RemoteScreenSocketService socketService,
                                       AuthContextService authContextService) {
        this.registry = registry;
        this.socketService = socketService;
        this.authContextService = authContextService;
    }

    @GetMapping
    @Operation(summary = "在线屏幕列表（只列本账号登录的页面）")
    public Result<?> list(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = requireAdmin(authorization);
        if (user == null) return Result.error("未登录或令牌无效");
        List<Map<String, Object>> rows = registry.listOwned(user.getId()).stream()
                .map(RemoteScreenRegistry.Entry::toView)
                .collect(Collectors.toList());
        return Result.success(rows);
    }

    /**
     * 凭配对码找到那台页面。
     *
     * <p>码是页面角落显示、手机上手输的短码 —— **用它就能操作不属于本账号的展示页**
     * （展厅那台常常是别的账号登着）。列表本身仍只列本账号的页面。
     */
    @PostMapping("/pair")
    @Operation(summary = "用配对码找到页面")
    public Result<?> pair(@RequestHeader(value = "Authorization", required = false) String authorization,
                          @RequestBody Map<String, Object> body) {
        User user = requireAdmin(authorization);
        if (user == null) return Result.error("未登录或令牌无效");
        String code = body.get("code") == null ? "" : String.valueOf(body.get("code"));
        RemoteScreenRegistry.Entry e = registry.getByCode(code);
        if (e == null) {
            return Result.error("配对码不正确，或那台页面已经离线");
        }
        return Result.success(e.toView(), "已连上「" + (e.label.isBlank() ? "未命名屏幕" : e.label) + "」");
    }

    @PostMapping("/{screenId}/navigate")
    @Operation(summary = "让指定屏幕跳到某个路由")
    public Result<?> navigate(@RequestHeader(value = "Authorization", required = false) String authorization,
                              @PathVariable("screenId") String screenId,
                              @RequestBody Map<String, Object> body) {
        User user = requireAdmin(authorization);
        if (user == null) return Result.error("未登录或令牌无效");
        String route = body.get("route") == null ? "" : String.valueOf(body.get("route")).trim();
        String code = body.get("code") == null ? "" : String.valueOf(body.get("code")).trim();
        if (!isSafeRoute(route)) {
            return Result.error("路由必须以 / 开头（不要带域名）");
        }
        if (!socketService.navigate(screenId, route, user.getId(), code)) {
            return Result.error("该屏幕不在线，或没有控制它的权限");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("screenId", screenId);
        out.put("route", route);
        return Result.success(out, "已下发跳转");
    }

    @PutMapping("/{screenId}/label")
    @Operation(summary = "给屏幕起名（小程序里辨认哪一台）")
    public Result<?> rename(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @PathVariable("screenId") String screenId,
                            @RequestBody Map<String, Object> body) {
        User user = requireAdmin(authorization);
        if (user == null) return Result.error("未登录或令牌无效");
        String label = body.get("label") == null ? "" : String.valueOf(body.get("label")).trim();
        String code = body.get("code") == null ? "" : String.valueOf(body.get("code")).trim();
        if (label.isEmpty()) {
            return Result.error("名称不能为空");
        }
        if (!socketService.canControl(screenId, user.getId(), code)) {
            return Result.error("该屏幕不在线，或没有控制它的权限");
        }
        RemoteScreenRegistry.Entry e = registry.rename(screenId, label);
        if (e == null) {
            return Result.error("该屏幕不在线");
        }
        // 回写给它存到本地：不然它下次重连带回来的还是旧名字
        socketService.pushLabel(screenId, user.getId(), code, label);
        return Result.success(e.toView(), "已改名");
    }

    // ---------------------------------------------------------------- 内部

    /** 只接受站内绝对路径：拦截协议跳转与 //host 这类开放重定向。 */
    private static boolean isSafeRoute(String route) {
        return route != null && route.startsWith("/") && !route.startsWith("//") && !route.contains("://");
    }

    /** 校验管理员；通过返回用户，否则 null。 */
    private User requireAdmin(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return null;
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            return null;
        }
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.MEMBER;
        if (role.getLevel() < RoleEnum.ADMIN.getLevel()) {
            return null;
        }
        return user;
    }
}
