package com.example.demo.modules.nhp.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.nhp.entity.CrfEventRule;
import com.example.demo.modules.nhp.mapper.CrfEventRuleMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** NHP 事件规则配置。 */
@RestController
@RequestMapping("/api/nhp/event-rules")
@Tag(name = "NHP 事件规则", description = "crf_event_rule 列表/更新")
public class NhpEventRuleController {

    private final CrfEventRuleMapper eventRuleMapper;

    public NhpEventRuleController(CrfEventRuleMapper eventRuleMapper) {
        this.eventRuleMapper = eventRuleMapper;
    }

    @GetMapping
    @Operation(summary = "事件规则列表")
    public Result<List<CrfEventRule>> list() {
        return Result.success(eventRuleMapper.listAll());
    }

    @PutMapping("/{id}")
    @Operation(summary = "更新事件规则")
    @Transactional
    public Result<CrfEventRule> update(@PathVariable Long id, @RequestBody Map<String, Object> patch) {
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
