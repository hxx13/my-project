package com.example.demo.modules.smartsheet.validator;

import com.example.demo.modules.smartsheet.enums.ColumnType;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;

public class ColumnValidator {
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static final int MAX_COLUMNS = 100;

    public static void validate(String columnsConfigJson) {
        List<Map<String, Object>> columns;
        try {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> parsed = objectMapper.readValue(columnsConfigJson, List.class);
            columns = parsed;
        } catch (Exception e) {
            throw new IllegalArgumentException("列定义 JSON 格式不合法");
        }
        if (columns.size() > MAX_COLUMNS) {
            throw new IllegalArgumentException("超过最大列数限制(" + MAX_COLUMNS + ")");
        }
        Set<String> keys = new HashSet<>();
        for (Map<String, Object> col : columns) {
            String key = (String) col.get("key");
            if (key == null || key.isBlank()) throw new IllegalArgumentException("列 key 不能为空");
            if (!keys.add(key)) throw new IllegalArgumentException("列 key 重复: " + key);
            String type = (String) col.getOrDefault("type", "text");
            if (!ColumnType.validValues().contains(type)) {
                throw new IllegalArgumentException("不支持的列类型: " + type);
            }
            if (("select".equals(type) || "multi-select".equals(type) || "radio".equals(type))
                && col.get("options") == null) {
                throw new IllegalArgumentException("列 '" + key + "' 为选择类型，必须提供 options");
            }
        }
    }

    public static boolean isValidCellValue(ColumnType type, Object value) {
        if (value == null) return true;
        return switch (type) {
            case NUMBER -> value instanceof Number || (value instanceof String s && s.matches("-?\\d+(\\.\\d+)?"));
            case CHECKBOX -> value instanceof Boolean || "true".equals(value) || "false".equals(value);
            case DATE -> true;
            default -> true;
        };
    }
}
