package com.example.demo.modules.twin.obligation.support;

/**
 * 期 2 Obligation 约定：来源类型、状态、渠道、处置类型。
 */
public final class ObligationSupport {

    public static final String SOURCE_STUDENT_VIOLATION = "STUDENT_VIOLATION";
    public static final String SOURCE_ANNOUNCEMENT = "ANNOUNCEMENT";
    public static final String SOURCE_UNBOUND = "UNBOUND";

    public static final String STATUS_PENDING_DELIVERY = "PENDING_DELIVERY";
    public static final String STATUS_DELIVERED = "DELIVERED";
    public static final String STATUS_PENDING_DISPOSITION = "PENDING_DISPOSITION";
    public static final String STATUS_COMPLETED = "COMPLETED";
    public static final String STATUS_EXPIRED = "EXPIRED";
    public static final String STATUS_REVOKED = "REVOKED";

    public static final String DISPOSITION_SHOW_ONLY = "SHOW_ONLY";
    public static final String DISPOSITION_ACK_READ = "ACK_READ";
    public static final String DISPOSITION_ACK_PUZZLE = "ACK_PUZZLE";
    public static final String DISPOSITION_QUIZ = "QUIZ";
    public static final String DISPOSITION_SIGNATURE = "SIGNATURE";

    /** 内容变更后要求重新确认时写入的标记（disposition_config 或业务侧） */
    public static final String FLAG_REQUIRE_RECONFIRM = "requireReconfirm";

    public static final String CHANNEL_SCAN = "SCAN";
    public static final String CHANNEL_H5 = "H5";
    public static final String CHANNEL_MP = "MP";
    public static final String CHANNEL_NOTIFY = "NOTIFY";

    /** 未绑卡全局配置的稳定 source_id（非用户维度；主体仍为人） */
    public static final String UNBOUND_SOURCE_ID = "global";

    private ObligationSupport() {
    }

    public static String sourceIdForViolation(long violationId) {
        return String.valueOf(violationId);
    }

    public static String sourceIdForAnnouncement(long announcementId) {
        return String.valueOf(announcementId);
    }

    public static boolean isTerminal(String status) {
        if (status == null || status.isBlank()) {
            return false;
        }
        return switch (status.trim().toUpperCase()) {
            case STATUS_COMPLETED, STATUS_EXPIRED, STATUS_REVOKED -> true;
            default -> false;
        };
    }
}
