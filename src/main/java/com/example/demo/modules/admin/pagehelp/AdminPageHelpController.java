package com.example.demo.modules.admin.pagehelp;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.mp.util.MpHtmlSanitizer;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/page-help")
@Tag(name = "后台页面帮助", description = "各管理页教程与留言")
public class AdminPageHelpController {

    private static final int MAX_PATH_LEN = 512;
    private static final int MAX_MSG_LEN = 2000;

    private final AdminPageHelpRepository repository;

    public AdminPageHelpController(AdminPageHelpRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    @Operation(summary = "加载当前页教程与留言")
    public Result<?> load(@RequestParam("path") String path, HttpServletRequest request) {
        Result<?> denied = requireStaff(request);
        if (denied != null) {
            return denied;
        }
        String p = normalizePath(path);
        if (p == null) {
            return Result.error("路径无效：须以 /admin 开头且不含 ..");
        }
        Map<String, Object> data = new HashMap<>();
        var row = repository.findHelpRow(p);
        if (row.isPresent()) {
            data.putAll(row.get());
        } else {
            data.put("bodyHtml", null);
            data.put("updatedAt", null);
            data.put("updatedBy", null);
        }
        List<Map<String, Object>> messages = repository.listMessages(p);
        data.put("messages", messages);
        return Result.success(data);
    }

    @PutMapping
    @Operation(summary = "保存教程正文（管理员及以上）")
    public Result<?> saveBody(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) {
            return denied;
        }
        String path = body.get("path") == null ? "" : String.valueOf(body.get("path"));
        String p = normalizePath(path);
        if (p == null) {
            return Result.error("路径无效");
        }
        String html = body.get("bodyHtml") == null ? "" : String.valueOf(body.get("bodyHtml"));
        String safe = MpHtmlSanitizer.sanitizeBodyHtml(html);
        User u = currentUser(request);
        repository.upsertBody(p, safe, u.getId());
        return Result.success();
    }

    @PostMapping("/messages")
    @Operation(summary = "发表留言")
    public Result<?> postMessage(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        Result<?> denied = requireStaff(request);
        if (denied != null) {
            return denied;
        }
        String path = body.get("path") == null ? "" : String.valueOf(body.get("path"));
        String p = normalizePath(path);
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
        Map<String, Object> out = new HashMap<>();
        out.put("id", id);
        return Result.success(out);
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

    /**
     * 规范化 path：UTF-8 解码、去尾斜杠、限制长度；必须以 /admin 开头。
     */
    private String normalizePath(String raw) {
        if (raw == null) {
            return null;
        }
        String p = URLDecoder.decode(raw.trim(), StandardCharsets.UTF_8);
        if (!p.startsWith("/")) {
            p = "/" + p;
        }
        if (p.length() > MAX_PATH_LEN) {
            p = p.substring(0, MAX_PATH_LEN);
        }
        if (p.contains("..")) {
            return null;
        }
        if (!p.startsWith("/admin")) {
            return null;
        }
        while (p.length() > 1 && p.endsWith("/")) {
            p = p.substring(0, p.length() - 1);
        }
        return p;
    }
}
