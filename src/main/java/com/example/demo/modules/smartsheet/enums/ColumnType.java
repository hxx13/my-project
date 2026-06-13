package com.example.demo.modules.smartsheet.enums;

import java.util.Set;

public enum ColumnType {
    TEXT("text"),
    NUMBER("number"),
    SELECT("select"),
    MULTI_SELECT("multi-select"),
    DATE("date"),
    CHECKBOX("checkbox"),
    USER("user"),
    PROGRESSBAR("progressbar"),
    RADIO("radio");

    private final String value;

    ColumnType(String value) { this.value = value; }

    public String getValue() { return value; }

    public static ColumnType fromValue(String value) {
        for (ColumnType ct : values()) {
            if (ct.value.equals(value)) return ct;
        }
        throw new IllegalArgumentException("不支持的列类型: " + value);
    }

    public static Set<String> validValues() {
        return Set.of("select", "multi-select", "date", "checkbox", "number", "text",
                      "user", "progressbar", "radio");
    }
}
