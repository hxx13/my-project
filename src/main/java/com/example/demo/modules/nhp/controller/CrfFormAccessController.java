package com.example.demo.modules.nhp.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.nhp.service.NhpPermissionService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * NHP 表单级访问设置（按 项目×事件×表单 一组开关：锁定/本人查看/他人查看/本人编辑/他人编辑）。
 * projectId=0 / eventId=0 表示全局默认。读：登录即可；写：NHP专家或平台所有者。
 */
@RestController
@RequestMapping("/api/nhp/form-access")
public class CrfFormAccessController {

    private final JdbcTemplate jdbcTemplate;
    private final AuthContextService authContextService;
    private final NhpPermissionService permissionService;

    public CrfFormAccessController(JdbcTemplate jdbcTemplate,
                                   AuthContextService authContextService,
                                   NhpPermissionService permissionService) {
        this.jdbcTemplate = jdbcTemplate;
        this.authContextService = authContextService;
        this.permissionService = permissionService;
    }

    private void requireNhpExpert(String auth) {
        User user = authContextService.resolveUserFromBearer(auth);
        if (user == null) {
            throw new TwinBusinessException(401, "未登录或 Token 无效");
        }
        if (!permissionService.isNhpExpert(user)) {
            throw new TwinBusinessException(403, "无权限：需 NHP专家 身份");
        }
    }

    @GetMapping
    public Result<List<Map<String, Object>>> list() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT project_id, event_id, form_key, locked, self_view, others_view, self_edit, others_edit FROM crf_form_access ORDER BY project_id, event_id, form_key");
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            Map<String, Object> m = new HashMap<>();
            m.put("projectId", r.get("project_id"));
            m.put("eventId", r.get("event_id"));
            m.put("formKey", r.get("form_key"));
            m.put("locked", toBool(r.get("locked")));
            m.put("selfView", toBool(r.get("self_view")));
            m.put("othersView", toBool(r.get("others_view")));
            m.put("selfEdit", toBool(r.get("self_edit")));
            m.put("othersEdit", toBool(r.get("others_edit")));
            out.add(m);
        }
        return Result.success(out);
    }

    @GetMapping("/{formKey}")
    public Result<Map<String, Object>> get(
            @PathVariable String formKey,
            @RequestParam(defaultValue = "0") Long projectId,
            @RequestParam(defaultValue = "0") Long eventId) {
        var rows = jdbcTemplate.queryForList(
                "SELECT locked, self_view, others_view, self_edit, others_edit FROM crf_form_access WHERE project_id = ? AND event_id = ? AND form_key = ?",
                projectId, eventId, formKey);
        Map<String, Object> m = new HashMap<>();
        m.put("projectId", projectId);
        m.put("eventId", eventId);
        m.put("formKey", formKey);
        if (rows.isEmpty()) {
            m.put("locked", false);
            m.put("selfView", true);
            m.put("othersView", true);
            m.put("selfEdit", true);
            m.put("othersEdit", true);
        } else {
            Map<String, Object> r = rows.get(0);
            m.put("locked", toBool(r.get("locked")));
            m.put("selfView", toBool(r.get("self_view")));
            m.put("othersView", toBool(r.get("others_view")));
            m.put("selfEdit", toBool(r.get("self_edit")));
            m.put("othersEdit", toBool(r.get("others_edit")));
        }
        return Result.success(m);
    }

    @PutMapping("/{formKey}")
    public Result<?> set(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String formKey,
            @RequestParam(defaultValue = "0") Long projectId,
            @RequestParam(defaultValue = "0") Long eventId,
            @RequestBody Map<String, Object> body) {
        requireNhpExpert(auth);
        int locked = boolOf(body, "locked") ? 1 : 0;
        int selfView = boolOf(body, "selfView") ? 1 : 0;
        int othersView = boolOf(body, "othersView") ? 1 : 0;
        int selfEdit = boolOf(body, "selfEdit") ? 1 : 0;
        int othersEdit = boolOf(body, "othersEdit") ? 1 : 0;
        jdbcTemplate.update(
                "INSERT INTO crf_form_access (project_id, event_id, form_key, locked, self_view, others_view, self_edit, others_edit) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?) "
                        + "ON DUPLICATE KEY UPDATE locked = VALUES(locked), self_view = VALUES(self_view), "
                        + "others_view = VALUES(others_view), self_edit = VALUES(self_edit), others_edit = VALUES(others_edit)",
                projectId, eventId, formKey, locked, selfView, othersView, selfEdit, othersEdit);
        return Result.success();
    }

    private boolean toBool(Object v) {
        if (v == null) return false;
        if (v instanceof Boolean b) return b;
        if (v instanceof Number n) return n.intValue() != 0;
        return "1".equals(String.valueOf(v));
    }

    private boolean boolOf(Map<String, Object> body, String key) {
        Object v = body == null ? null : body.get(key);
        return toBool(v);
    }
}
