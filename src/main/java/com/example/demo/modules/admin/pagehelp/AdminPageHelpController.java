package com.example.demo.modules.admin.pagehelp;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/admin/page-help")
@Tag(name = "后台页面帮助", description = "各管理页教程、版本历史与留言")
public class AdminPageHelpController {

    private static final int MAX_MSG_LEN = 2000;

    private final PageHelpService pageHelpService;
    private final AdminPageHelpRepository repository;

    public AdminPageHelpController(PageHelpService pageHelpService, AdminPageHelpRepository repository) {
        this.pageHelpService = pageHelpService;
        this.repository = repository;
    }

    @GetMapping
    @Operation(summary = "加载当前页教程、版本历史与留言")
    public Result<?> load(@RequestParam("path") String path, HttpServletRequest request) {
        Result<?> denied = requireStaff(request);
        if (denied != null) {
            return denied;
        }
        String p = PageHelpPathUtil.normalizeForAdminWrite(path);
        if (p == null) {
            return Result.error("路径无效");
        }
        return Result.success(pageHelpService.loadBundleForAdmin(p));
    }

    @PostMapping("/versions")
    @Operation(summary = "发布新版本（管理员及以上）")
    public Result<?> publishVersion(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) {
            return denied;
        }
        String path = body.get("path") == null ? "" : String.valueOf(body.get("path"));
        String p = PageHelpPathUtil.normalizeForAdminWrite(path);
        if (p == null) {
            return Result.error("路径无效");
        }
        String versionLabel = body.get("versionLabel") == null ? "" : String.valueOf(body.get("versionLabel"));
        String versionKind = body.get("versionKind") == null ? "update" : String.valueOf(body.get("versionKind"));
        String html = body.get("bodyHtml") == null ? "" : String.valueOf(body.get("bodyHtml"));
        User u = currentUser(request);
        try {
            return Result.success(pageHelpService.publishVersion(p, versionLabel, versionKind, html, u.getId()));
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        }
    }

    @PutMapping("/versions")
    @Operation(summary = "编辑已有版本（管理员及以上，版本号不可改）")
    public Result<?> updateVersion(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) {
            return denied;
        }
        String path = body.get("path") == null ? "" : String.valueOf(body.get("path"));
        String p = PageHelpPathUtil.normalizeForAdminWrite(path);
        if (p == null) {
            return Result.error("路径无效");
        }
        long id = parseLong(body.get("id"));
        if (id <= 0) {
            return Result.error("版本 id 无效");
        }
        String versionKind = body.get("versionKind") == null ? "update" : String.valueOf(body.get("versionKind"));
        String html = body.get("bodyHtml") == null ? "" : String.valueOf(body.get("bodyHtml"));
        User u = currentUser(request);
        try {
            pageHelpService.updateVersion(p, id, versionKind, html, u.getId());
            return Result.success();
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        }
    }

    @DeleteMapping("/versions")
    @Operation(summary = "删除版本（管理员及以上）")
    public Result<?> deleteVersion(@RequestParam("path") String path, @RequestParam("id") long id, HttpServletRequest request) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) {
            return denied;
        }
        String p = PageHelpPathUtil.normalizeForAdminWrite(path);
        if (p == null) {
            return Result.error("路径无效");
        }
        if (id <= 0) {
            return Result.error("版本 id 无效");
        }
        User u = currentUser(request);
        try {
            pageHelpService.deleteVersion(p, id, u.getId());
            return Result.success();
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        }
    }

    /** @deprecated 请使用 POST /versions 发布带版本号的帮助 */
    @PutMapping
    @Operation(summary = "（兼容）保存教程正文，自动作为 patch 版本发布")
    public Result<?> saveBody(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) {
            return denied;
        }
        String path = body.get("path") == null ? "" : String.valueOf(body.get("path"));
        String p = PageHelpPathUtil.normalizeForAdminWrite(path);
        if (p == null) {
            return Result.error("路径无效");
        }
        String html = body.get("bodyHtml") == null ? "" : String.valueOf(body.get("bodyHtml"));
        User u = currentUser(request);
        String nextLabel = suggestNextPatchVersion(p);
        try {
            return Result.success(pageHelpService.publishVersion(p, nextLabel, "update", html, u.getId()));
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        }
    }

    @PostMapping("/messages")
    @Operation(summary = "发表留言")
    public Result<?> postMessage(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        Result<?> denied = requireStaff(request);
        if (denied != null) {
            return denied;
        }
        String path = body.get("path") == null ? "" : String.valueOf(body.get("path"));
        String p = PageHelpPathUtil.normalizeForAdminWrite(path);
        if (p == null) {
            return Result.error("路径无效");
        }
        String msg = body.get("body") == null ? "" : String.valueOf(body.get("body")).trim();
        if (!StringUtils.hasText(msg)) {
            return Result.error("留言不能为空");
        }
        if (msg.length() > MAX_MSG_LEN) {
            return Result.error("留言过长，最多 " + MAX_MSG_LEN + " 字");
        }
        User u = currentUser(request);
        long id = repository.insertMessage(p, u.getId(), msg);
        return Result.success(Map.of("id", id));
    }

    private String suggestNextPatchVersion(String pagePath) {
        return repository.findLatestVersion(pagePath)
                .map(v -> {
                    String label = String.valueOf(v.get("versionLabel"));
                    try {
                        String num = label.toUpperCase().replaceFirst("^V", "");
                        String[] parts = num.split("\\.");
                        int major = Integer.parseInt(parts[0]);
                        int minor = parts.length > 1 ? Integer.parseInt(parts[1]) : 0;
                        int patch = parts.length > 2 ? Integer.parseInt(parts[2]) : 0;
                        return "V" + major + "." + minor + "." + (patch + 1);
                    } catch (Exception e) {
                        return "V1.0.1";
                    }
                })
                .orElse("V1.0.0");
    }

    private static long parseLong(Object raw) {
        if (raw == null) {
            return 0L;
        }
        if (raw instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(raw).trim());
        } catch (NumberFormatException e) {
            return 0L;
        }
    }

    private User currentUser(HttpServletRequest request) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        return (User) attr;
    }

    private Result<?> requireStaff(HttpServletRequest request) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (!(attr instanceof User currentUser)) {
            return Result.error("当前登录信息无效");
        }
        RoleEnum role = currentUser.getRole() == null ? RoleEnum.STUDENT : currentUser.getRole();
        if (role.getLevel() < RoleEnum.STAFF.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }

    private Result<?> requireAdmin(HttpServletRequest request) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (!(attr instanceof User currentUser)) {
            return Result.error("当前登录信息无效");
        }
        RoleEnum role = currentUser.getRole() == null ? RoleEnum.STUDENT : currentUser.getRole();
        if (role.getLevel() < RoleEnum.ADMIN.getLevel()) {
            return Result.error("无权限：仅管理员及以上可编辑教程");
        }
        return null;
    }
}
