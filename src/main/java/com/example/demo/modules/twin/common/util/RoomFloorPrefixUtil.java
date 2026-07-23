package com.example.demo.modules.twin.common.util;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 从房间名提取楼层标签 — 与小程序 {@code aroapp/miniprogram/utils/roomDashboard.js} {@code floorPrefix} 一致：
 * 有连字符取首段；否则匹配 B?F；否则「其它」。B1F 优先于 1F（正则顺序）。
 */
public final class RoomFloorPrefixUtil {

    private static final Pattern FLOOR_TOKEN = Pattern.compile("(B\\d+F|\\d+F)", Pattern.CASE_INSENSITIVE);

    private RoomFloorPrefixUtil() {}

    public static String floorPrefix(String roomName) {
        if (roomName == null || roomName.isBlank()) {
            return "UNKNOWN";
        }
        String raw = roomName.trim();
        int idx = raw.indexOf('-');
        if (idx >= 0) {
            String prefix = raw.substring(0, idx).trim();
            if (!prefix.isEmpty()) {
                return prefix;
            }
        }
        Matcher m = FLOOR_TOKEN.matcher(raw);
        if (m.find()) {
            return m.group(1).toUpperCase(Locale.ROOT);
        }
        return "其它";
    }

    /** 学生/手机端列表分组：无楼层时返回空串 */
    public static String deriveFloorLabel(String roomName) {
        String p = floorPrefix(roomName);
        if ("UNKNOWN".equals(p) || "其它".equals(p)) {
            return "";
        }
        return p;
    }
}
