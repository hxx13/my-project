package com.example.demo.modules.reportform.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.List;

/** 将填报字段值格式化为 Excel/PDF 可读文本 */
final class ReportFormFieldValueFormatter {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private ReportFormFieldValueFormatter() {}

    static String format(JsonNode fieldDef, JsonNode valueNode) {
        if (valueNode == null || valueNode.isNull() || isEmpty(valueNode)) {
            return "";
        }
        String type = fieldDef != null && fieldDef.has("type") ? fieldDef.get("type").asText("TEXT") : "TEXT";
        return switch (type) {
            case "BOOLEAN" -> formatBoolean(valueNode);
            case "SELECT" -> resolveOptionLabel(fieldDef, valueNode, false);
            case "MULTI_SELECT" -> resolveOptionLabel(fieldDef, valueNode, true);
            case "NUMBER" -> formatNumber(valueNode);
            case "DATETIME" -> valueNode.asText("").replace('T', ' ');
            case "IMAGE" -> formatUrl(valueNode, "[图片]");
            case "FILE" -> formatUrl(valueNode, "[文件]");
            case "USER", "AUTO_USER" -> valueNode.asText("");
            default -> valueNode.isTextual() ? valueNode.asText("")
                    : (valueNode.isNumber() || valueNode.isBoolean()) ? valueNode.asText() : valueNode.toString();
        };
    }

    private static boolean isEmpty(JsonNode v) {
        if (v.isTextual()) {
            String s = v.asText("");
            return s.isEmpty() || "null".equalsIgnoreCase(s);
        }
        if (v.isArray()) return v.isEmpty();
        return false;
    }

    private static String formatBoolean(JsonNode v) {
        if (v.isBoolean()) return v.asBoolean() ? "是" : "否";
        String s = v.asText("").trim();
        if ("true".equalsIgnoreCase(s) || "1".equals(s) || "yes".equalsIgnoreCase(s)) return "是";
        if ("false".equalsIgnoreCase(s) || "0".equals(s) || "no".equalsIgnoreCase(s)) return "否";
        return s;
    }

    private static String formatNumber(JsonNode v) {
        if (v.isNumber()) return v.asText();
        return v.asText("").trim();
    }

    private static String formatUrl(JsonNode v, String fallback) {
        String s = v.asText("").trim();
        if (s.isEmpty() || "null".equalsIgnoreCase(s)) return "";
        return s.startsWith("http") ? s : fallback;
    }

    private static String resolveOptionLabel(JsonNode fieldDef, JsonNode valueNode, boolean multi) {
        if (multi) {
            List<String> labels = new ArrayList<>();
            JsonNode arr = valueNode.isArray() ? valueNode : null;
            if (arr == null && valueNode.isTextual()) {
                String raw = valueNode.asText("");
                if (raw.startsWith("[")) {
                    try {
                        arr = MAPPER.readTree(raw);
                    } catch (Exception ignored) {
                        arr = null;
                    }
                }
                if (arr == null && !raw.isBlank()) {
                    for (String p : raw.split("[,，、]")) {
                        labels.add(labelForValue(fieldDef, p.trim()));
                    }
                    return String.join("、", labels);
                }
            }
            if (arr != null) {
                for (JsonNode item : arr) {
                    labels.add(labelForValue(fieldDef, item.asText("")));
                }
            }
            return String.join("、", labels);
        }
        return labelForValue(fieldDef, valueNode.asText(""));
    }

    private static String labelForValue(JsonNode fieldDef, String value) {
        if (value == null || value.isBlank()) return "";
        JsonNode options = fieldDef != null ? fieldDef.get("options") : null;
        if (options != null && options.isArray()) {
            for (JsonNode opt : options) {
                if (value.equals(opt.path("value").asText(""))) {
                    String label = opt.path("label").asText("");
                    return label.isBlank() ? value : label;
                }
            }
        }
        return value;
    }
}
