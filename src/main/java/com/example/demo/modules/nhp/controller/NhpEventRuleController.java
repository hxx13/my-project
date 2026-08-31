package com.example.demo.modules.nhp.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.nhp.entity.CrfEventRule;
import com.example.demo.modules.nhp.mapper.CrfEventRuleMapper;
import com.example.demo.modules.nhp.service.NhpPermissionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** NHP 事件规则配置。写操作：默认方案仅平台所有者（团队方案待 Phase 5）。 */
@RestController
@RequestMapping("/api/nhp/event-rules")
@Tag(name = "NHP 事件规则", description = "crf_event_rule 列表/更新")
public class NhpEventRuleController {

    private final CrfEventRuleMapper eventRuleMapper;
    private final AuthContextService authContextService;
    private final NhpPermissionService permissionService;

    public NhpEventRuleController(CrfEventRuleMapper eventRuleMapper,
                                  AuthContextService authContextService,
                                  NhpPermissionService permissionService) {
        this.eventRuleMapper = eventRuleMapper;
        this.authContextService = authContextService;
        this.permissionService = permissionService;
    }

    private void requirePlatformOwner(String auth) {
        User user = authContextService.resolveUserFromBearer(auth);
        if (user == null) {
            throw new TwinBusinessException(401, "未登录或 Token 无效");
        }
        if (!permissionService.isPlatformOwner(user)) {
            throw new TwinBusinessException(403, "无权限：需平台所有者");
        }
    }

    @GetMapping
    @Operation(summary = "事件规则列表")
    public Result<List<CrfEventRule>> list() {
        return Result.success(eventRuleMapper.listAll());
    }

    @PutMapping("/{id}")
    @Operation(summary = "更新事件规则")
    @Transactional
    public Result<CrfEventRule> update(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable Long id, @RequestBody Map<String, Object> patch) {
        requirePlatformOwner(auth);
        CrfEventRule row = eventRuleMapper.findById(id);
        if (row == null) {
            return Result.fail(404, "事件规则不存在");
        }
        if (patch.containsKey("triggerOn") && patch.get("triggerOn") != null) {
            row.setTriggerOn(String.valueOf(patch.get("triggerOn")).trim());
        }
        if (patch.containsKey("triggerCond")) {
            Object v = patch.get("triggerCond");
            row.setTriggerCond(v == null || String.valueOf(v).isBlank() ? null : String.valueOf(v).trim());
        }
        if (patch.containsKey("action") && patch.get("action") != null) {
            row.setAction(String.valueOf(patch.get("action")).trim());
        }
        if (patch.containsKey("actionSpec")) {
            Object v = patch.get("actionSpec");
            row.setActionSpec(v == null ? null : String.valueOf(v));
        }
        if (patch.containsKey("sortOrder") && patch.get("sortOrder") instanceof Number n) {
            row.setSortOrder(n.intValue());
        }
        if (patch.containsKey("active")) {
            Object v = patch.get("active");
            if (v instanceof Boolean b) row.setActive(b);
            else if (v instanceof Number n) row.setActive(n.intValue() != 0);
            else if (v != null) row.setActive(Boolean.parseBoolean(String.valueOf(v)));
        }
        eventRuleMapper.update(row);
        return Result.success(eventRuleMapper.findById(id));
    }
}
