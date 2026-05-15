package com.example.demo.common.enums;

import java.util.Arrays;

public enum RoleEnum {
    STUDENT("STUDENT", "学生", 1),
    STAFF("STAFF", "普通员工", 2),
    SENIOR("SENIOR", "高级员工", 3),
    ADMIN("ADMIN", "管理员", 4),
    SUPER_ADMIN("SUPER_ADMIN", "超级管理员", 5),
    PLATFORM_OWNER("PLATFORM_OWNER", "平台所有者", 6);

    private final String code;
    private final String descZh;
    private final int level;

    RoleEnum(String code, String descZh, int level) {
        this.code = code;
        this.descZh = descZh;
        this.level = level;
    }

    public String getCode() {
        return code;
    }

    public String getDescZh() {
        return descZh;
    }

    public int getLevel() {
        return level;
    }

    public static RoleEnum fromCode(String code) {
        return Arrays.stream(values())
                .filter(item -> item.code.equalsIgnoreCase(code))
                .findFirst()
                .orElse(STUDENT);
    }
}
