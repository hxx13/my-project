package com.example.demo.modules.twin.support;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 扫码弹窗（analyze / execute）结构化单行日志，流程结束后一次性输出。
 */
public final class ScanPopupFlowLog {

    private static final Logger log = LoggerFactory.getLogger(ScanPopupFlowLog.class);
    private static final int ROOM_LIST_MAX = 96;

    private ScanPopupFlowLog() {
    }

    public static String inputMode(boolean looksLikeCardToken) {
        return looksLikeCardToken ? "读卡" : "扫码";
    }

    public static String cardMode(boolean hasPhysicalMapping, boolean borrowedOnExecute) {
        if (!hasPhysicalMapping) {
            return "领用公卡";
        }
        return borrowedOnExecute ? "领用公卡" : "自带卡";
    }

    public static String presence(String currentState) {
        if (currentState == null) {
            return "未知";
        }
        return switch (currentState.trim().toUpperCase()) {
            case "INSIDE" -> "场内";
            case "OUTSIDE" -> "场外";
            case "UNKNOWN" -> "未知";
            default -> currentState;
        };
    }

    public static String action(int accessType) {
        return accessType == 1 ? "进入" : "离开";
    }

    public static String joinRoomNames(List<Map<String, Object>> rooms) {
        if (rooms == null || rooms.isEmpty()) {
            return "—";
        }
        String joined = rooms.stream()
                .map(ScanPopupFlowLog::roomDisplayName)
                .filter(s -> s != null && !s.isBlank())
                .distinct()
                .collect(Collectors.joining(","));
        return abbrev(joined, ROOM_LIST_MAX);
    }

    public static String roomDisplayName(Map<String, Object> room) {
        if (room == null) {
            return "";
        }
        Object dn = room.get("displayName");
        if (dn != null && !String.valueOf(dn).isBlank()) {
            return String.valueOf(dn).trim();
        }
        Object on = room.get("officialRoomName");
        if (on != null && !String.valueOf(on).isBlank()) {
            return String.valueOf(on).trim();
        }
        Object name = room.get("name");
        return name != null ? String.valueOf(name).trim() : "";
    }

    public static void logAnalyze(
            String traceId,
            boolean success,
            long costMs,
            String inputMode,
            String userId,
            String userName,
            boolean hasPhysicalMapping,
            String currentState,
            List<Map<String, Object>> pendingRooms,
            List<Map<String, Object>> allowedRooms,
            Boolean entryWindowEnabled,
            Boolean entryAllowedNow,
            Integer globalUserState,
            String message) {
        String id = abbrev(userId, 32);
        String name = abbrev(userName, 24);
        if (!success) {
            log.warn(
                    "[扫码·解析] trace={} | 失败 | 方式={} 键入={} | {} | {}ms",
                    traceId,
                    inputMode,
                    id,
                    abbrev(message, 80),
                    costMs);
            return;
        }
        String pending = joinRoomNames(pendingRooms);
        String allowed = allowedRooms == null ? "0间" : allowedRooms.size() + "间 " + joinRoomNames(allowedRooms);
        String window = entryWindow(Boolean.TRUE.equals(entryWindowEnabled), Boolean.TRUE.equals(entryAllowedNow));
        String risk = riskLabel(globalUserState);
        String card = hasPhysicalMapping ? "自带卡" : "领用公卡";
        log.info(
                "[扫码·解析] trace={} | 方式={} id={} 姓名={} | 在场={} 卡={} | 待离={} | 可进={} | 时段={} 风控={} | {}ms",
                traceId,
                inputMode,
                id,
                name,
                presence(currentState),
                card,
                pending,
                allowed,
                window,
                risk,
                costMs);
    }

    public static void logExecute(ExecuteSummary s) {
        if (s == null) {
            return;
        }
        String id = abbrev(s.userId, 32);
        String room = abbrev(s.roomLabel, 48);
        String card = cardMode(s.hasPhysicalMapping, s.borrowedCard);
        String act = action(s.accessType);
        if (!s.success) {
            log.warn(
                    "[扫码·登记] | 失败 | 动作={} id={} 姓名={} 房间={} 卡={} | {} | {}ms",
                    act,
                    id,
                    abbrev(s.userName, 24),
                    room,
                    card,
                    abbrev(s.failReason, 100),
                    s.costMs());
            return;
        }
        log.info(
                "[扫码·登记] | 成功 | 动作={} id={} 姓名={} 房间={} 卡={} | ARO={} 门禁={} exp={}{} | {}ms",
                act,
                id,
                abbrev(s.userName, 24),
                room,
                card,
                s.aroLabel,
                s.linkageLabel,
                s.expAdded,
                s.extraNote == null || s.extraNote.isBlank() ? "" : " " + s.extraNote,
                s.costMs());
    }

    public static void logSync(
            String userId,
            int accessType,
            boolean found,
            String recordId,
            boolean borrowed,
            boolean shared,
            boolean keep) {
        if (!found) {
            log.debug(
                    "[扫码·流水] id={} 动作={} | 未即时命中（定时任务补全）",
                    abbrev(userId, 32),
                    action(accessType));
            return;
        }
        log.info(
                "[扫码·流水] id={} 动作={} 记录={} | 标记 领借={} 共享={} 保管={}",
                abbrev(userId, 32),
                action(accessType),
                recordId,
                borrowed ? "是" : "否",
                shared ? "是" : "否",
                keep ? "是" : "否");
    }

    private static String entryWindow(boolean enabled, boolean allowedNow) {
        if (!enabled) {
            return "不限";
        }
        return allowedNow ? "可进" : "禁进";
    }

    public static String linkageShort(
            int accessType,
            com.example.demo.modules.accessrule.service.AccessRuleDispatchResult dispatch,
            int deferSec,
            boolean keepCard) {
        if (accessType == 2 && deferSec > 0) {
            return "延迟" + deferSec + "s";
        }
        if (keepCard && accessType == 1) {
            return "保管豁免";
        }
        if (dispatch == null) {
            return "—";
        }
        return switch (dispatch) {
            case BATCH_OK -> "下发";
            case DELETE_OK -> "回收";
            case NO_RULE -> "无规则";
            case SCAN_LINKAGE_ENTER_DISABLED, SCAN_LINKAGE_EXIT_DISABLED -> "联动关";
            case BATCH_FAILED, DELETE_FAILED -> "联动失败";
            case MATCHED_NO_PRIVILEGE -> "无权限";
            case NO_MAPPING -> "未绑卡";
            case NO_PERSON_CODE -> "无人码";
            default -> dispatch.name();
        };
    }

    private static String riskLabel(Integer state) {
        if (state == null) {
            return "—";
        }
        return switch (state) {
            case 2 -> "正常";
            case 3 -> "滞留封禁";
            default -> "码" + state;
        };
    }

    private static String abbrev(String s, int max) {
        if (s == null || s.isBlank()) {
            return "—";
        }
        String t = s.trim();
        return t.length() <= max ? t : t.substring(0, max - 1) + "…";
    }

    /** executeScan 流程汇总（在 finally 中输出） */
    public static final class ExecuteSummary {
        public final long startMs = System.currentTimeMillis();
        public String userId;
        public String userName;
        public String roomLabel;
        public int accessType;
        public boolean borrowedCard;
        public boolean hasPhysicalMapping;
        public boolean success;
        public String failReason;
        public String aroLabel = "—";
        public String linkageLabel = "—";
        public int expAdded;
        public String extraNote;

        public long costMs() {
            return Math.max(0, System.currentTimeMillis() - startMs);
        }

        public void fail(String reason) {
            success = false;
            failReason = reason;
        }

        public void ok(String aro, String linkage, int exp, String note) {
            success = true;
            aroLabel = aro;
            linkageLabel = linkage;
            expAdded = exp;
            extraNote = note;
        }
    }
}
