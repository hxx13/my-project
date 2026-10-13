package com.example.demo.modules.aup.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 修订等级判定（纯逻辑，无状态，便于单测）。
 *
 * <p>比较「现行内容」与「新提交内容」，按每个字段的修改等级（LOCKED/MINOR/MAJOR）分类改动。
 * 等级来自字段 config 的 amendmentLevel 键，未配置默认 MINOR。
 *
 * <p>容器类字段（table/repeatGroup/group）按整块 JSON 比较，因此增行、删行、改格子
 * 都算「该字段有变」，天然覆盖「增删附表格」「增加非药用化合物」这类结构变化。
 */
public final class AupAmendmentClassifier {

    public static final String LEVEL_LOCKED = "LOCKED";
    public static final String LEVEL_MINOR = "MINOR";
    public static final String LEVEL_MAJOR = "MAJOR";

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private AupAmendmentClassifier() {
    }

    /** 分类结果：按等级分组的「有改动」字段键列表。 */
    public record Classification(List<String> locked, List<String> major, List<String> minor) {
        public boolean hasLocked() {
            return !locked.isEmpty();
        }

        public boolean hasMajor() {
            return !major.isEmpty();
        }

        public boolean isEmpty() {
            return locked.isEmpty() && major.isEmpty() && minor.isEmpty();
        }
    }

    /**
     * @param levels  字段键 → 等级（LOCKED/MINOR/MAJOR），由模板字段 config 解析而来
     * @param oldJson 现行内容（aup_data.data）
     * @param newJson 新提交内容
     */
    public static Classification classify(Map<String, String> levels, String oldJson, String newJson) {
        return classify(levels, oldJson, newJson, Set.of());
    }

    /**
     * @param ignoredKeys 当前被条件（showWhen）隐藏的字段键。
     *                    这类字段在提交流程里值会被清空，与旧值相比必然「不同」，
     *                    但那是隐藏导致而非用户改动，不能算作修订。
     */
    public static Classification classify(Map<String, String> levels, String oldJson, String newJson,
                                          Set<String> ignoredKeys) {
        JsonNode oldNode = readTree(oldJson);
        JsonNode newNode = readTree(newJson);
        List<String> locked = new ArrayList<>();
        List<String> major = new ArrayList<>();
        List<String> minor = new ArrayList<>();
        for (Map.Entry<String, String> e : levels.entrySet()) {
            String key = e.getKey();
            if (ignoredKeys.contains(key)) {
                continue;
            }
            if (sameValue(oldNode.get(key), newNode.get(key))) {
                continue;
            }
            switch (normalizeLevel(e.getValue())) {
                case LEVEL_LOCKED -> locked.add(key);
                case LEVEL_MAJOR -> major.add(key);
                default -> minor.add(key);
            }
        }
        return new Classification(locked, major, minor);
    }

    /** 从字段 config JSON 解析 amendmentLevel；缺失或非法一律按 MINOR。 */
    public static String parseLevel(String configJson) {
        try {
            JsonNode cfg = readTree(configJson);
            JsonNode v = cfg.get("amendmentLevel");
            return v == null || v.isNull() ? LEVEL_MINOR : normalizeLevel(v.asText());
        } catch (Exception ignored) {
            return LEVEL_MINOR;
        }
    }

    private static String normalizeLevel(String raw) {
        if (raw == null) {
            return LEVEL_MINOR;
        }
        String s = raw.trim().toUpperCase();
        return switch (s) {
            case LEVEL_LOCKED -> LEVEL_LOCKED;
            case LEVEL_MAJOR -> LEVEL_MAJOR;
            default -> LEVEL_MINOR;
        };
    }

    private static JsonNode readTree(String json) {
        try {
            if (json == null || json.isBlank()) {
                return MAPPER.createObjectNode();
            }
            JsonNode n = MAPPER.readTree(json);
            return n == null || n.isNull() ? MAPPER.createObjectNode() : n;
        } catch (Exception e) {
            return MAPPER.createObjectNode();
        }
    }

    private static boolean sameValue(JsonNode a, JsonNode b) {
        boolean aEmpty = a == null || a.isNull() || isBlankish(a);
        boolean bEmpty = b == null || b.isNull() || isBlankish(b);
        if (aEmpty && bEmpty) {
            return true;
        }
        if (aEmpty || bEmpty) {
            return false;
        }
        return a.equals(b);
    }

    private static boolean isBlankish(JsonNode n) {
        if (n.isTextual()) {
            return n.asText().isBlank();
        }
        return (n.isArray() && n.isEmpty()) || (n.isObject() && n.isEmpty());
    }

    /** 调试/测试入口：给定字段等级与两份 JSON，打印分类结果。 */
    public static void main(String[] args) {
        Map<String, String> levels = new LinkedHashMap<>();
        levels.put("A1.period", LEVEL_MAJOR);
        levels.put("A1.name", LEVEL_LOCKED);
        levels.put("A2.address", LEVEL_MINOR);

        String oldJson = "{\"A1.period\":\"2026-01-01\",\"A1.name\":\"课题甲\",\"A2.address\":\"A楼\"}";
        String sameJson = "{\"A1.period\":\"2026-01-01\",\"A1.name\":\"课题甲\",\"A2.address\":\"A楼\"}";
        String minorJson = "{\"A1.period\":\"2026-01-01\",\"A1.name\":\"课题甲\",\"A2.address\":\"B楼\"}";
        String majorJson = "{\"A1.period\":\"2027-01-01\",\"A1.name\":\"课题甲\",\"A2.address\":\"B楼\"}";
        String lockedJson = "{\"A1.period\":\"2026-01-01\",\"A1.name\":\"课题乙\",\"A2.address\":\"A楼\"}";

        assert classify(levels, oldJson, sameJson).isEmpty() : "无改动应为空";
        Classification c1 = classify(levels, oldJson, minorJson);
        assert c1.minor().equals(List.of("A2.address")) && !c1.hasMajor() && !c1.hasLocked() : "仅小修";
        Classification c2 = classify(levels, oldJson, majorJson);
        assert c2.hasMajor() && c2.major().contains("A1.period") && c2.minor().contains("A2.address") : "混合触发";
        Classification c3 = classify(levels, oldJson, lockedJson);
        assert c3.hasLocked() && c3.locked().equals(List.of("A1.name")) : "命中禁改";
        assert classify(levels, "{}", "{\"A2.address\":\"\"}").isEmpty() : "旧值缺失+新值空白视为无变化";
        assert LEVEL_MINOR.equals(parseLevel("{}")) && LEVEL_MAJOR.equals(parseLevel("{\"amendmentLevel\":\"MAJOR\"}")) : "等级解析";
        System.out.println("AupAmendmentClassifier self-check OK");
    }
}
