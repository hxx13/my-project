package com.example.demo.modules.animalorder;

import java.util.List;

/** 动物订购校区：策略与可购窗口分浦东、浦西两套，节假日为全国口径不分校区。 */
public final class AnimalOrderCampus {

    public static final String DEFAULT = "浦东";
    public static final List<String> ALL = List.of("浦东", "浦西");

    private AnimalOrderCampus() {
    }

    /** 空值回退默认校区（兼容小程序等旧客户端）；非空但非法则报错，不静默兜底。 */
    public static String normalize(String campus) {
        if (campus == null || campus.isBlank()) {
            return DEFAULT;
        }
        String value = campus.trim();
        if (!ALL.contains(value)) {
            throw new IllegalArgumentException("无效的校区: " + campus);
        }
        return value;
    }
}
