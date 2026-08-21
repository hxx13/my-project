package com.example.demo.modules.agv.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.agv.analysis.model.AgvTag;
import com.example.demo.modules.agv.mapper.AgvTagMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * AGV 语义标签字典。
 *
 * <p>区域（{@code agv_spatial_element.semantic_tags}）与显隐状态
 * （{@code agv_tag_hidden.tag_name}）都按 <b>名字</b> 引用标签，名字即自然键，
 * 由 {@code agv_tag.name} 的唯一约束保证无歧义。因此改名和删除必须走本控制器，
 * 由它在同一事务内把两处引用一并更新——绕过去直接改库会造成引用失联。
 */
@RestController
@RequestMapping("/api/v1/agv/tags")
@Tag(name = "AGV 语义标签")
public class AgvTagController {

    private static final Logger log = LoggerFactory.getLogger(AgvTagController.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private static final int NAME_MAX = 32;
    private static final Set<String> SCOPES = Set.of("world", "agv");

    private final AgvTagMapper mapper;

    public AgvTagController(AgvTagMapper mapper) {
        this.mapper = mapper;
    }

    // ── 查询 ──

    @GetMapping
    @Operation(summary = "标签字典 + 各车显隐状态")
    public Result<Map<String, Object>> list() {
        Map<String, List<String>> hidden = new LinkedHashMap<>();
        for (Map<String, Object> row : mapper.selectAllHidden()) {
            String ip = String.valueOf(row.get("robotIp"));
            hidden.computeIfAbsent(ip, k -> new ArrayList<>()).add(String.valueOf(row.get("tagName")));
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("tags", mapper.selectAllTags());
        payload.put("hidden", hidden);
        return Result.success(payload);
    }

    // ── 增删改 ──

    @PostMapping
    @Operation(summary = "新建标签")
    public Result<AgvTag> create(@RequestBody AgvTag body) {
        String name = normalizeName(body.getName());
        String err = validate(name, body);
        if (err != null) return Result.error(err);
        if (mapper.selectTagByName(name) != null) {
            return Result.error("标签「" + name + "」已存在");
        }
        AgvTag t = new AgvTag();
        t.setName(name);
        t.setColor(normalizeColor(body.getColor()));
        t.setScope(body.getScope());
        t.setRobotIp("agv".equals(body.getScope()) ? body.getRobotIp() : null);
        t.setBuiltin(false);
        t.setSortOrder(body.getSortOrder() == null ? 100 : body.getSortOrder());
        mapper.insertTag(t);
        return Result.success(t);
    }

    @PutMapping("/{id}")
    @Operation(summary = "更新标签（改名会级联更新区域引用与显隐状态）")
    @Transactional
    public Result<AgvTag> update(@PathVariable Long id, @RequestBody AgvTag body) {
        AgvTag existing = mapper.selectTagById(id);
        if (existing == null) return Result.error("标签不存在");

        String newName = normalizeName(body.getName());
        String err = validate(newName, body);
        if (err != null) return Result.error(err);

        // 必须在改写 existing 之前捕获旧名——级联要靠它定位引用
        final String oldName = existing.getName();
        boolean renamed = !oldName.equals(newName);
        if (renamed) {
            // 内置标签的名字是系统语义：AgvSpatialService.inferTags() 自动生成区域时
            // 按名字硬编码打标签，改名会让自动标注落到一个不存在的标签上。
            if (Boolean.TRUE.equals(existing.getBuiltin())) {
                return Result.error("内置标签「" + existing.getName() + "」不可改名，仅可改颜色");
            }
            AgvTag clash = mapper.selectTagByName(newName);
            if (clash != null && !clash.getId().equals(id)) {
                return Result.error("标签「" + newName + "」已存在");
            }
        }

        existing.setName(newName);
        existing.setColor(normalizeColor(body.getColor()));
        existing.setScope(body.getScope());
        existing.setRobotIp("agv".equals(body.getScope()) ? body.getRobotIp() : null);
        if (body.getSortOrder() != null) existing.setSortOrder(body.getSortOrder());
        mapper.updateTag(existing);

        if (renamed) {
            int zones = cascadeRename(oldName, newName);
            // 显隐表同样按名引用。newName 若有脏残留会撞主键，先清干净再改。
            mapper.deleteHiddenByTagName(newName);
            mapper.renameHiddenTag(oldName, newName);
            log.info("[AgvTag] 标签「{}」改名为「{}」，级联更新 {} 个区域引用", oldName, newName, zones);
        }
        return Result.success(existing);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "删除标签（级联清除区域引用与显隐状态）")
    @Transactional
    public Result<String> delete(@PathVariable Long id) {
        AgvTag t = mapper.selectTagById(id);
        if (t == null) return Result.error("标签不存在");
        if (Boolean.TRUE.equals(t.getBuiltin())) {
            return Result.error("内置标签「" + t.getName() + "」不可删除");
        }
        int zones = cascadeRemove(t.getName());
        mapper.deleteHiddenByTagName(t.getName());
        mapper.deleteTag(id);
        return Result.success("已删除，同时清理了 " + zones + " 个区域的引用");
    }

    // ── 显隐 ──

    @PutMapping("/hidden")
    @Operation(summary = "设置某台车对某标签的显隐（全局共享）")
    public Result<String> setHidden(@RequestParam String robotIp,
                                    @RequestParam String tagName,
                                    @RequestParam boolean hidden) {
        if (hidden) {
            mapper.insertHidden(robotIp, tagName);
        } else {
            mapper.deleteHidden(robotIp, tagName);
        }
        return Result.success("ok");
    }

    // ── 级联 ──

    /** 把所有区域引用里的 oldName 换成 newName，返回受影响的区域数 */
    private int cascadeRename(String oldName, String newName) {
        return rewriteZoneTags(tags -> {
            if (!tags.contains(oldName)) return null;
            List<String> next = new ArrayList<>();
            for (String t : tags) {
                String v = oldName.equals(t) ? newName : t;
                if (!next.contains(v)) next.add(v); // 改名可能与已有标签重合，去重
            }
            return next;
        });
    }

    /** 把 name 从所有区域引用里移除，返回受影响的区域数 */
    private int cascadeRemove(String name) {
        return rewriteZoneTags(tags -> {
            if (!tags.contains(name)) return null;
            List<String> next = new ArrayList<>(tags);
            next.removeIf(name::equals);
            return next;
        });
    }

    /**
     * 遍历所有区域的 semantic_tags，交给 rewriter 决定新值（返回 null 表示不动）。
     * 只回写 semantic_tags 一列，不整行更新。
     */
    private int rewriteZoneTags(java.util.function.Function<List<String>, List<String>> rewriter) {
        int touched = 0;
        for (Map<String, Object> row : mapper.selectAllZoneTags()) {
            Object rawId = row.get("id");
            Object rawTags = row.get("semanticTags");
            if (rawId == null || rawTags == null) continue;
            List<String> tags = parseTags(String.valueOf(rawTags));
            if (tags == null) continue;
            List<String> next = rewriter.apply(tags);
            if (next == null) continue;
            mapper.updateZoneTags(((Number) rawId).longValue(), writeTags(next));
            touched++;
        }
        return touched;
    }

    private List<String> parseTags(String raw) {
        if (raw.isBlank()) return null;
        try {
            return JSON.readValue(raw, new TypeReference<List<String>>() {});
        } catch (Exception e) {
            log.warn("[AgvTag] 区域 semantic_tags 非法，跳过级联: {}", raw);
            return null;
        }
    }

    private String writeTags(List<String> tags) {
        try {
            return JSON.writeValueAsString(tags);
        } catch (Exception e) {
            return "[]";
        }
    }

    // ── 校验 ──

    private String normalizeName(String name) {
        return name == null ? "" : name.trim();
    }

    private String normalizeColor(String color) {
        if (color == null || !color.startsWith("#")) return "#6b7280";
        return color.trim();
    }

    private String validate(String name, AgvTag body) {
        if (name.isEmpty()) return "标签名不能为空";
        if (name.length() > NAME_MAX) return "标签名不能超过 " + NAME_MAX + " 个字符";
        if (body.getScope() == null || !SCOPES.contains(body.getScope())) {
            return "scope 必须是 world 或 agv";
        }
        if ("agv".equals(body.getScope()) && (body.getRobotIp() == null || body.getRobotIp().isBlank())) {
            return "绑定单车的标签必须指定 robotIp";
        }
        return null;
    }
}
