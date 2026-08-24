package com.example.demo.modules.aup.service;

import com.example.demo.modules.referencedata.entity.RefData;
import com.example.demo.modules.referencedata.mapper.ReferenceDataMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * ARO 同步计划书的动物白名单兼容层。
 *
 * <p>ARO 侧 B5/B6 仅保存粗粒度品种/品系名称（animalVarietyName / animalStrainName），
 * 与本地 ref_data 树（ANIMAL_BREED → ANIMAL_STRAIN → GENOTYPE）命名粒度不一致。
 * 策略：
 * <ol>
 *   <li>同步/批准时：归一化标题匹配 ref_data；品系解析失败则退化为物种大类 SUBTREE。</li>
 *   <li>订购校验：{@code created_by=aro} 的计划书放宽为祖先链命中任一条目 refDataId，
 *       并辅以归一化标题兜底（条目 label 与节点 displayName 一致）。</li>
 * </ol>
 */
@Component
public class AupAnimalAllowlistCompat {

    private static final Logger log = LoggerFactory.getLogger(AupAnimalAllowlistCompat.class);

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public AupAnimalAllowlistCompat(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    /** 从本地表单 JSON（B5.blocks / B6.blocks）构建白名单。 */
    public String buildFromFormJson(String dataJson) {
        Map<String, Object> map = parseMap(dataJson);
        return toJson(buildEntries(map, false));
    }

    /** ARO 同步专用：品系匹配失败时退化为物种大类 SUBTREE。 */
    public String buildFromAroFormJson(String dataJson) {
        Map<String, Object> map = parseMap(dataJson);
        return toJson(buildEntries(map, true));
    }

    /**
     * 标准白名单校验（本地批准计划书）：SUBTREE 命中祖先链，EXACT 仅命中叶节点。
     */
    public boolean isAllowed(List<Map<String, Object>> entries, Long leafId, ReferenceDataMapper referenceDataMapper) {
        return match(entries, leafId, referenceDataMapper, false);
    }

    /**
     * ARO 同步计划书放宽校验：祖先链任一层命中条目 refDataId 即通过；
     * 未命中时再按归一化 label/displayName 比对。
     */
    public boolean isAllowedRelaxed(List<Map<String, Object>> entries, Long leafId,
                                    ReferenceDataMapper referenceDataMapper) {
        return match(entries, leafId, referenceDataMapper, true);
    }

    private boolean match(List<Map<String, Object>> entries, Long leafId,
                          ReferenceDataMapper referenceDataMapper, boolean relaxed) {
        if (leafId == null || entries == null || entries.isEmpty()) {
            return false;
        }
        List<RefData> ancestors = referenceDataMapper.findAncestors(leafId);
        if (ancestors == null || ancestors.isEmpty()) {
            return false;
        }
        for (RefData node : ancestors) {
            boolean isLeaf = node.getId().equals(leafId);
            for (Map<String, Object> e : entries) {
                Long rid = toLong(e.get("refDataId"));
                if (rid != null && rid.equals(node.getId())) {
                    String scope = e.get("scope") == null ? null : String.valueOf(e.get("scope"));
                    if (relaxed || "SUBTREE".equals(scope) || isLeaf) {
                        return true;
                    }
                }
            }
        }
        if (!relaxed) {
            return false;
        }
        for (RefData node : ancestors) {
            String nodeTitle = normalizeTitle(extractDisplayName(node));
            if (!StringUtils.hasText(nodeTitle)) {
                continue;
            }
            for (Map<String, Object> e : entries) {
                String label = normalizeTitle(e.get("label") == null ? null : String.valueOf(e.get("label")));
                if (StringUtils.hasText(label) && (label.equals(nodeTitle) || nodeTitle.contains(label) || label.contains(nodeTitle))) {
                    return true;
                }
            }
        }
        return false;
    }

    private List<Map<String, Object>> buildEntries(Map<String, Object> data, boolean aroCompat) {
        List<Map<String, Object>> entries = new ArrayList<>();
        collectB5Blocks(data, entries);
        collectB6Blocks(data, entries, aroCompat);
        return entries;
    }

    private void collectB5Blocks(Map<String, Object> data, List<Map<String, Object>> entries) {
        Object blocks = data == null ? null : data.get("B5.blocks");
        if (!(blocks instanceof List<?> bl)) {
            return;
        }
        for (Object block : bl) {
            if (!(block instanceof Map<?, ?> m)) {
                continue;
            }
            addEntry(entries, m.get("species"), "ANIMAL_BREED", "SUBTREE", false);
        }
    }

    private void collectB6Blocks(Map<String, Object> data, List<Map<String, Object>> entries, boolean aroCompat) {
        Object blocks = data == null ? null : data.get("B6.blocks");
        if (!(blocks instanceof List<?> bl)) {
            return;
        }
        for (Object block : bl) {
            if (!(block instanceof Map<?, ?> m)) {
                continue;
            }
            Object species = m.get("species");
            Object line = m.get("line");
            if (line == null) {
                line = species;
            }
            Long strainId = resolveSpeciesRefDataId(line, "ANIMAL_STRAIN");
            if (strainId != null) {
                addEntry(entries, line, "ANIMAL_STRAIN", "EXACT", false, strainId);
                continue;
            }
            if (aroCompat) {
                Long breedId = resolveSpeciesRefDataId(species, "ANIMAL_BREED");
                if (breedId != null) {
                    addEntry(entries, species, "ANIMAL_BREED", "SUBTREE", true, breedId);
                }
            }
        }
    }

    private void addEntry(List<Map<String, Object>> entries, Object speciesOrLine, String refType, String scope,
                          boolean aroFallback) {
        addEntry(entries, speciesOrLine, refType, scope, aroFallback, null);
    }

    private void addEntry(List<Map<String, Object>> entries, Object speciesOrLine, String refType, String scope,
                          boolean aroFallback, Long knownId) {
        Long refDataId = knownId != null ? knownId : resolveSpeciesRefDataId(speciesOrLine, refType);
        if (refDataId == null) {
            return;
        }
        Map<String, Object> e = new LinkedHashMap<>();
        e.put("refType", refType);
        e.put("refDataId", refDataId);
        e.put("scope", scope);
        String label = extractLabel(speciesOrLine);
        if (StringUtils.hasText(label)) {
            e.put("label", label);
        }
        if (aroFallback) {
            e.put("aroFallback", true);
        }
        entries.add(e);
    }

    private Long resolveSpeciesRefDataId(Object species, String refType) {
        if (species == null) {
            return null;
        }
        if (species instanceof Map<?, ?> sm) {
            Object rid = sm.get("refDataId");
            if (rid instanceof Number n) {
                return n.longValue();
            }
            if (rid != null) {
                try {
                    return Long.parseLong(String.valueOf(rid).trim());
                } catch (NumberFormatException ignore) {
                }
            }
            Object label = sm.get("label");
            return label == null ? null : resolveRefDataIdByTitle(refType, String.valueOf(label).trim());
        }
        return resolveRefDataIdByTitle(refType, String.valueOf(species).trim());
    }

    /** 归一化标题：去空白、小写、去常见后缀，提升 ARO 粗粒度名称命中率。 */
    private Long resolveRefDataIdByTitle(String refType, String title) {
        if (!StringUtils.hasText(title)) {
            return null;
        }
        String exact = title.trim();
        Long id = queryRefDataId(refType, exact);
        if (id != null) {
            return id;
        }
        String norm = normalizeTitle(exact);
        if (!norm.equals(exact)) {
            id = queryRefDataIdNormalized(refType, norm);
            if (id != null) {
                return id;
            }
        }
        return queryRefDataIdLike(refType, norm);
    }

    private Long queryRefDataId(String refType, String title) {
        try {
            List<Long> ids = jdbcTemplate.queryForList(
                    "SELECT id FROM ref_data WHERE ref_type = ? AND JSON_UNQUOTE(JSON_EXTRACT(field_data, '$.title')) = ? LIMIT 1",
                    Long.class, refType, title);
            return ids.isEmpty() ? null : ids.get(0);
        } catch (Exception e) {
            log.warn("[aup-allowlist] 解析 ref_data 失败 refType={} title={} err={}", refType, title, e.getMessage());
            return null;
        }
    }

    private Long queryRefDataIdNormalized(String refType, String normTitle) {
        try {
            List<Long> ids = jdbcTemplate.queryForList(
                    "SELECT id FROM ref_data WHERE ref_type = ? "
                            + "AND LOWER(REPLACE(REPLACE(JSON_UNQUOTE(JSON_EXTRACT(field_data, '$.title')), ' ', ''), '　', '')) = ? "
                            + "LIMIT 1",
                    Long.class, refType, normTitle);
            return ids.isEmpty() ? null : ids.get(0);
        } catch (Exception e) {
            return null;
        }
    }

    /** 前缀/包含匹配：ARO「小鼠」vs 本地「ICR小鼠」等。 */
    private Long queryRefDataIdLike(String refType, String normTitle) {
        if (!StringUtils.hasText(normTitle) || normTitle.length() < 2) {
            return null;
        }
        try {
            List<Long> ids = jdbcTemplate.queryForList(
                    "SELECT id FROM ref_data WHERE ref_type = ? "
                            + "AND LOWER(REPLACE(REPLACE(JSON_UNQUOTE(JSON_EXTRACT(field_data, '$.title')), ' ', ''), '　', '')) "
                            + "LIKE CONCAT('%', ?, '%') ORDER BY CHAR_LENGTH(JSON_UNQUOTE(JSON_EXTRACT(field_data, '$.title'))) ASC LIMIT 1",
                    Long.class, refType, normTitle);
            return ids.isEmpty() ? null : ids.get(0);
        } catch (Exception e) {
            return null;
        }
    }

    private String extractLabel(Object speciesOrLine) {
        if (speciesOrLine instanceof Map<?, ?> sm) {
            Object label = sm.get("label");
            return label == null ? null : String.valueOf(label).trim();
        }
        return speciesOrLine == null ? null : String.valueOf(speciesOrLine).trim();
    }

    private String normalizeTitle(String title) {
        if (title == null) {
            return "";
        }
        return title.trim().toLowerCase().replace(" ", "").replace("　", "");
    }

    private String extractDisplayName(RefData refData) {
        if (refData == null || refData.getFieldData() == null) {
            return null;
        }
        try {
            Map<?, ?> fd = objectMapper.readValue(refData.getFieldData(), Map.class);
            Object title = fd.get("title");
            return title == null ? null : String.valueOf(title);
        } catch (Exception e) {
            return null;
        }
    }

    private Long toLong(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseMap(String json) {
        if (json == null || json.isBlank()) {
            return new LinkedHashMap<>();
        }
        try {
            return objectMapper.readValue(json, Map.class);
        } catch (Exception e) {
            return new LinkedHashMap<>();
        }
    }

    private String toJson(List<Map<String, Object>> entries) {
        if (entries == null || entries.isEmpty()) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(entries);
        } catch (Exception e) {
            log.warn("[aup-allowlist] 序列化白名单失败: {}", e.getMessage());
            return null;
        }
    }
}
