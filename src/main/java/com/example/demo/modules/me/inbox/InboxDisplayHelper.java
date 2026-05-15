package com.example.demo.modules.me.inbox;

import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * 收件箱时间线与通知展示：状态码转中文、统一时间格式。
 */
public final class InboxDisplayHelper {

    private static final DateTimeFormatter SHORT_DT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private InboxDisplayHelper() {
    }

    public static String formatShort(LocalDateTime t) {
        if (t == null) {
            return "";
        }
        return t.format(SHORT_DT);
    }

    public static String repairOrPurchaseStatusZh(String status) {
        if (!StringUtils.hasText(status)) {
            return "";
        }
        String s = status.trim().toUpperCase();
        return switch (s) {
            case "PENDING" -> "待处理";
            case "PROCESSING" -> "处理中";
            case "COMPLETED" -> "已完成";
            default -> status;
        };
    }

    public static String supplyClaimStatusZh(String status) {
        if (!StringUtils.hasText(status)) {
            return "";
        }
        String s = status.trim().toUpperCase();
        return switch (s) {
            case "PENDING" -> "待出库";
            case "FULFILLED" -> "已完成";
            case "WITHDRAWN" -> "已撤回";
            case "DELETED" -> "已删除";
            case "CLOSED" -> "已关闭";
            default -> status;
        };
    }

    public static String applicantLine(String applicantName, String applicantId, String fallbackDisplayName) {
        if (StringUtils.hasText(applicantName)) {
            return applicantName.trim();
        }
        if (StringUtils.hasText(fallbackDisplayName)) {
            return fallbackDisplayName.trim();
        }
        if (StringUtils.hasText(applicantId)) {
            return applicantId.trim();
        }
        return "未知申请人";
    }
}
