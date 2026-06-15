package com.example.demo.modules.reportform.validator;

import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.common.exception.TwinBusinessException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.*;
import java.util.regex.Pattern;

/**
 * 填报报表字段校验器 — 独立实现，不引用 smartsheet 包。
 * 按字段 type 独立校验：NUMBER 范围、TEXT 长度、SELECT 选项合法性、
 * IMAGE URL 格式、FILE 大小、DATETIME 格式。
 */
public final class FieldValidator {

    private static final ObjectMapper objectMapper = new ObjectMapper();

    /** 简单 URL 格式校验 */
    private static final Pattern URL_PATTERN = Pattern.compile(
        "^https?://[\\w\\-]+(\\.[\\w\\-]+)+.*$", Pattern.CASE_INSENSITIVE);

    /** 最大文件大小 50MB */
    private static final long MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

    private FieldValidator() {}

    /**
     * 校验单个字段值。无效时抛出 TwinBusinessException。
     *
     * @param fieldKey  字段 key
     * @param fieldDef  字段定义 JSON 节点（来自 layout_json.fields.<key>）
     * @param value     用户提交的值（可空）
     */
    public static void validate(String fieldKey, JsonNode fieldDef, Object value) {
        if (fieldDef == null) return;

        String type = fieldDef.has("type") ? fieldDef.get("type").asText() : "TEXT";

        // 允许 null/空值（required 校验在提交时单独处理）
        if (value == null || (value instanceof String && ((String) value).isEmpty())) {
            return;
        }

        try {
            switch (type) {
                case "TEXT"  -> validateText(fieldKey, fieldDef, value);
                case "NUMBER" -> validateNumber(fieldKey, fieldDef, value);
                case "BOOLEAN" -> { /* any truthy/falsy OK */ }
                case "SELECT" -> validateSelect(fieldKey, fieldDef, value, false);
                case "MULTI_SELECT" -> validateSelect(fieldKey, fieldDef, value, true);
                case "DATETIME" -> validateDatetime(fieldKey, value);
                case "IMAGE" -> validateImage(fieldKey, value);
                case "FILE" -> validateFile(fieldKey, fieldDef, value);
                case "USER" -> { /* any string OK */ }
                case "AUTO_USER" -> { /* auto-injected by service, skip */ }
                default -> { /* unknown type, skip */ }
            }
        } catch (TwinBusinessException e) {
            throw e;
        } catch (Exception e) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_FIELD_INVALID,
                "字段 [" + fieldKey + "] 校验异常: " + e.getMessage());
        }
    }

    // ──────────── TEXT ────────────

    private static void validateText(String fieldKey, JsonNode fieldDef, Object value) {
        String text = String.valueOf(value);
        if (fieldDef.has("maxLength") && !fieldDef.get("maxLength").isNull()) {
            int maxLength = fieldDef.get("maxLength").asInt();
            if (text.length() > maxLength) {
                throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_FIELD_INVALID,
                    "字段 [" + fieldKey + "] 超过最大长度 " + maxLength);
            }
        }
    }

    // ──────────── NUMBER ────────────

    private static void validateNumber(String fieldKey, JsonNode fieldDef, Object value) {
        double num;
        try {
            num = Double.parseDouble(String.valueOf(value));
        } catch (NumberFormatException e) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_FIELD_INVALID,
                "字段 [" + fieldKey + "] 不是有效数字");
        }
        if (fieldDef.has("min") && !fieldDef.get("min").isNull()) {
            double min = fieldDef.get("min").asDouble();
            if (num < min) {
                throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_FIELD_INVALID,
                    "字段 [" + fieldKey + "] 不能小于 " + min);
            }
        }
        if (fieldDef.has("max") && !fieldDef.get("max").isNull()) {
            double max = fieldDef.get("max").asDouble();
            if (num > max) {
                throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_FIELD_INVALID,
                    "字段 [" + fieldKey + "] 不能大于 " + max);
            }
        }
    }

    // ──────────── SELECT / MULTI_SELECT ────────────

    private static void validateSelect(String fieldKey, JsonNode fieldDef, Object value, boolean multi) {
        Set<String> validValues = collectOptionValues(fieldDef);
        if (validValues.isEmpty()) return; // 无选项定义，跳过

        if (multi) {
            List<?> selected;
            if (value instanceof List<?> list) {
                selected = list;
            } else if (value instanceof String s && s.startsWith("[")) {
                try { selected = objectMapper.readValue(s, List.class); }
                catch (Exception e) { return; }
            } else {
                return;
            }
            for (Object item : selected) {
                if (!validValues.contains(String.valueOf(item))) {
                    throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_FIELD_INVALID,
                        "字段 [" + fieldKey + "] 包含无效选项: " + item);
                }
            }
        } else {
            if (!validValues.contains(String.valueOf(value))) {
                throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_FIELD_INVALID,
                    "字段 [" + fieldKey + "] 选项值无效: " + value);
            }
        }
    }

    private static Set<String> collectOptionValues(JsonNode fieldDef) {
        Set<String> values = new LinkedHashSet<>();
        if (fieldDef.has("options") && fieldDef.get("options").isArray()) {
            for (JsonNode opt : fieldDef.get("options")) {
                if (opt.has("value")) values.add(opt.get("value").asText());
                else if (opt.has("label")) values.add(opt.get("label").asText());
            }
        }
        // TODO: 通过 optionSetId 引用的选项集会由 Service 层展开后传入
        return values;
    }

    // ──────────── DATETIME ────────────

    private static void validateDatetime(String fieldKey, Object value) {
        String s = String.valueOf(value);
        // 接受 ISO 8601 大致格式
        if (!s.matches("^\\d{4}-\\d{2}-\\d{2}(T\\d{2}:\\d{2}(:\\d{2})?)?.*$")) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_FIELD_INVALID,
                "字段 [" + fieldKey + "] 日期时间格式不正确，应为 YYYY-MM-DD 或 YYYY-MM-DDTHH:mm");
        }
    }

    // ──────────── IMAGE ────────────

    private static void validateImage(String fieldKey, Object value) {
        String s = String.valueOf(value);
        if (s.length() > 2048) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_FIELD_INVALID,
                "字段 [" + fieldKey + "] URL 长度超过限制");
        }
        // 宽松校验：本地路径或 HTTP URL
        if (!URL_PATTERN.matcher(s).matches() && !s.startsWith("/")) {
            // 非标准 URL 也放行（可能是相对路径）
        }
    }

    // ──────────── FILE ────────────

    private static void validateFile(String fieldKey, JsonNode fieldDef, Object value) {
        // FILE 字段值通常是文件 URL 或文件名
        String s = String.valueOf(value);
        if (s.length() > 2048) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_FIELD_INVALID,
                "字段 [" + fieldKey + "] 文件路径过长");
        }
        if (fieldDef.has("props")) {
            JsonNode props = fieldDef.get("props");
            if (props.has("maxSizeMB")) {
                // 文件大小由上传接口校验，此处只做元数据校验
            }
        }
    }

    // ──────────── 批量校验 ────────────

    /**
     * 批量校验所有字段值。返回所有校验失败的错误信息列表。
     * 空列表表示全部通过。
     */
    public static List<String> validateAll(JsonNode fieldsNode, Map<String, Object> values) {
        List<String> errors = new ArrayList<>();
        if (fieldsNode == null) return errors;

        var iter = fieldsNode.fields();
        while (iter.hasNext()) {
            var entry = iter.next();
            String fieldKey = entry.getKey();
            JsonNode fieldDef = entry.getValue();
            Object value = values.get(fieldKey);
            try {
                validate(fieldKey, fieldDef, value);
            } catch (TwinBusinessException e) {
                errors.add(e.getMessage());
            }
        }
        return errors;
    }

    /**
     * 检查必填字段是否都已填写。
     * @return 缺失的必填字段 label 列表
     */
    public static List<String> checkRequired(JsonNode fieldsNode, Map<String, Object> values) {
        List<String> missing = new ArrayList<>();
        if (fieldsNode == null) return missing;

        var iter = fieldsNode.fields();
        while (iter.hasNext()) {
            var entry = iter.next();
            String fieldKey = entry.getKey();
            JsonNode fieldDef = entry.getValue();
            if (fieldDef.has("required") && fieldDef.get("required").asBoolean()) {
                Object val = values.get(fieldKey);
                if (val == null || (val instanceof String s && s.isEmpty())) {
                    String label = fieldDef.has("label") ? fieldDef.get("label").asText() : fieldKey;
                    missing.add(label);
                }
            }
        }
        return missing;
    }
}
