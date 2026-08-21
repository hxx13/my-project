package com.example.demo.modules.cageshelf.support;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * ARO 字段映射服务 — 加载 aro_field_mapping.json，提供双向翻译。
 *
 * Pull:  ARO 响应 → applyPull(endpoint, rawData) → 规范名 Map
 * Push:  本地字段 → applyPush(endpoint, canonicalMap) → ARO 字段 Map
 */
@Service
public class CageFieldMappingService {

    private static final Logger log = LoggerFactory.getLogger(CageFieldMappingService.class);

    private JSONObject config;
    private final Map<String, MappingEntry> byCanonical = new LinkedHashMap<>();
    private final List<FilterRule> filters = new ArrayList<>();

    @PostConstruct
    public void load() {
        try (InputStream is = new ClassPathResource("aro_field_mapping.json").getInputStream()) {
            String raw = new String(is.readAllBytes(), StandardCharsets.UTF_8);
            config = JSON.parseObject(raw);
            JSONArray mappings = config.getJSONArray("mappings");
            for (int i = 0; i < mappings.size(); i++) {
                JSONObject m = mappings.getJSONObject(i);
                MappingEntry entry = new MappingEntry();
                entry.canonical = m.getString("canonical");
                entry.type = m.getString("type");
                entry.sources = new LinkedHashMap<>();
                JSONObject src = m.getJSONObject("sources");
                if (src != null) {
                    for (String ep : src.keySet()) {
                        Object v = src.get(ep);
                        if (v instanceof JSONArray arr) {
                            List<String> aliases = new ArrayList<>();
                            for (int j = 0; j < arr.size(); j++) aliases.add(arr.getString(j));
                            entry.sources.put(ep, aliases);
                        } else {
                            entry.sources.put(ep, List.of(String.valueOf(v)));
                        }
                    }
                }
                entry.targets = new LinkedHashMap<>();
                JSONObject tgt = m.getJSONObject("targets");
                if (tgt != null) {
                    for (String ep : tgt.keySet()) entry.targets.put(ep, tgt.getString(ep));
                }
                byCanonical.put(entry.canonical, entry);
            }
            // filters
            JSONArray flt = config.getJSONArray("filters");
            if (flt != null) {
                for (int i = 0; i < flt.size(); i++) {
                    JSONObject f = flt.getJSONObject(i);
                    if ("skip".equals(f.getString("rule"))) {
                        FilterRule rule = new FilterRule();
                        rule.endpoint = f.getString("endpoint");
                        rule.field = f.getString("field");
                        rule.matches = new HashSet<>();
                        JSONArray mArr = f.getJSONArray("match");
                        if (mArr != null) for (int j = 0; j < mArr.size(); j++) rule.matches.add(String.valueOf(mArr.get(j)));
                        filters.add(rule);
                    }
                }
            }
            log.info("[field-mapping] 加载完成: {} 个映射, {} 个过滤规则, version={}",
                    byCanonical.size(), filters.size(), config.getString("version"));
        } catch (Exception e) {
            log.error("[field-mapping] 加载失败: {}", e.getMessage(), e);
        }
    }

    /**
     * Pull 方向：从 ARO 原始 Map 提取规范字段。
     * <p>别名按顺序取<strong>首个路径存在</strong>的值：路径存在且空串/空白 → 写入 null（本地应清空）；
     * 仅当路径不存在时才试下一个别名。禁止「跳过空值去找非空别名」，避免假保留旧 PI。
     */
    public Map<String, Object> applyPull(String endpoint, Map<String, Object> raw) {
        // 先检查过滤规则
        for (FilterRule f : filters) {
            if (f.endpoint.equals(endpoint)) {
                Object val = resolveNested(raw, f.field);
                if (val != null && f.matches.contains(String.valueOf(val))) return null;
            }
        }
        Map<String, Object> result = new LinkedHashMap<>();
        for (MappingEntry e : byCanonical.values()) {
            List<String> aliases = e.sources.get(endpoint);
            if (aliases == null) continue;
            for (String alias : aliases) {
                NestedHit hit = resolveNestedHit(raw, alias);
                if (!hit.present) continue;
                Object val = hit.value;
                if (val == null || "".equals(String.valueOf(val).trim())) {
                    result.put(e.canonical, null);
                } else {
                    result.put(e.canonical, convert(val, e.type));
                }
                break;
            }
        }
        return result;
    }

    /** Push 方向：从规范字段 Map 生成 ARO 请求体，boolean→1/0，保持 ARO Yn 字段兼容 */
    public Map<String, Object> applyPush(String endpoint, Map<String, Object> canonical) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (Map.Entry<String, Object> kv : canonical.entrySet()) {
            MappingEntry e = byCanonical.get(kv.getKey());
            if (e == null) continue;
            String aroField = e.targets.get(endpoint);
            if (aroField == null) continue;
            setNested(result, aroField, convertForPush(kv.getValue(), e.type));
        }
        return result;
    }

    /** Push 方向类型转换：boolean→1/0（ARO Yn 字段用整数），其余保持原值 */
    private Object convertForPush(Object val, String type) {
        if (val == null) return null;
        if ("boolean".equals(type)) {
            if (val instanceof Boolean b) return b ? 1 : 0;
            return ("true".equalsIgnoreCase(String.valueOf(val)) || "1".equals(String.valueOf(val))) ? 1 : 0;
        }
        return val;
    }

    /** 解析 "cageBoxVo.needDivideYn" 这样的嵌套路径（路径不存在时返回 null） */
    private Object resolveNested(Map<String, Object> root, String path) {
        return resolveNestedHit(root, path).value;
    }

    /**
     * 解析嵌套路径并区分「键不存在」与「键存在但值为空」。
     * 中间节点为 null / 非 Map 时视为路径不存在，可回退下一别名。
     */
    @SuppressWarnings("unchecked")
    private NestedHit resolveNestedHit(Map<String, Object> root, String path) {
        if (root == null || path == null || path.isBlank()) return NestedHit.absent();
        String[] parts = path.split("\\.");
        Object current = root;
        for (int i = 0; i < parts.length; i++) {
            if (!(current instanceof Map<?, ?> m)) return NestedHit.absent();
            Map<String, Object> map = (Map<String, Object>) m;
            String key = parts[i];
            if (!map.containsKey(key)) return NestedHit.absent();
            current = map.get(key);
            if (i < parts.length - 1 && current == null) return NestedHit.absent();
        }
        return NestedHit.of(current);
    }

    @SuppressWarnings("unchecked")
    private void setNested(Map<String, Object> root, String path, Object value) {
        String[] parts = path.split("\\.");
        Map<String, Object> current = root;
        for (int i = 0; i < parts.length - 1; i++) {
            current = (Map<String, Object>) current.computeIfAbsent(parts[i], k -> new LinkedHashMap<>());
        }
        current.put(parts[parts.length - 1], value);
    }

    private Object convert(Object val, String type) {
        if (val == null) return null;
        return switch (type) {
            case "int" -> val instanceof Number n ? n.intValue() : Integer.parseInt(String.valueOf(val).trim());
            case "long" -> val instanceof Number n ? n.longValue() : Long.parseLong(String.valueOf(val).trim());
            case "boolean" -> val instanceof Boolean b ? b
                    : ("1".equals(String.valueOf(val)) || "true".equalsIgnoreCase(String.valueOf(val)));
            default -> val instanceof String s ? s : String.valueOf(val);
        };
    }

    public String getVersion() { return config != null ? config.getString("version") : "?"; }

    // ---- inner types ----

    static class MappingEntry {
        String canonical, type;
        Map<String, List<String>> sources; // endpoint → ARO field aliases
        Map<String, String> targets;       // endpoint → ARO field name
    }
    static class FilterRule {
        String endpoint, field;
        Set<String> matches;
    }

    /** 嵌套路径解析结果：present=路径上每一段键都存在 */
    private static final class NestedHit {
        final boolean present;
        final Object value;

        private NestedHit(boolean present, Object value) {
            this.present = present;
            this.value = value;
        }

        static NestedHit absent() { return new NestedHit(false, null); }
        static NestedHit of(Object value) { return new NestedHit(true, value); }
    }
}
