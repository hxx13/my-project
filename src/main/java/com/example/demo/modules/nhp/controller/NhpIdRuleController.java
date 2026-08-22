package com.example.demo.modules.nhp.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.nhp.entity.CrfIdRule;
import com.example.demo.modules.nhp.mapper.CrfIdRuleMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** NHP 编码规则配置。 */
@RestController
@RequestMapping("/api/nhp/idrules")
@Tag(name = "NHP 编码规则", description = "crf_id_rule 列表/更新")
public class NhpIdRuleController {

    private final CrfIdRuleMapper idRuleMapper;

    public NhpIdRuleController(CrfIdRuleMapper idRuleMapper) {
        this.idRuleMapper = idRuleMapper;
    }

    @GetMapping
    @Operation(summary = "编码规则列表")
    public Result<List<CrfIdRule>> list() {
        return Result.success(idRuleMapper.list());
    }

    @PutMapping("/{id}")
    @Operation(summary = "更新 pattern / derived")
    @Transactional
    public Result<CrfIdRule> update(@PathVariable Long id, @RequestBody Map<String, Object> patch) {
        CrfIdRule row = idRuleMapper.findById(id);
        if (row == null) {
            return Result.fail(404, "编码规则不存在");
        }
        if (patch.containsKey("pattern") && patch.get("pattern") != null) {
            row.setPattern(String.valueOf(patch.get("pattern")).trim());
        }
        if (patch.containsKey("derived")) {
            Object v = patch.get("derived");
            if (v instanceof Boolean b) row.setDerived(b);
            else if (v instanceof Number n) row.setDerived(n.intValue() != 0);
            else if (v != null) row.setDerived(Boolean.parseBoolean(String.valueOf(v)));
        }
        idRuleMapper.updatePatternAndDerived(row);
        return Result.success(idRuleMapper.findById(id));
    }
}
