package com.example.demo.modules.twin.support;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 超时/定时任务排查用结构化日志。日志名 {@code twin.diagnostics}，便于 {@code grep "ARO·耗时"}。
 */
public final class TwinTimingDiagnostics {

    public static final String LOGGER_NAME = "twin.diagnostics";

    private static final Logger log = LoggerFactory.getLogger(LOGGER_NAME);

    private TwinTimingDiagnostics() {
    }

    public static void logAro(String operation, String userId, long costMs, boolean ok, String detail) {
        String uid = abbrev(userId, 48);
        String msg = String.format("[ARO·耗时] op=%s userId=%s ms=%d ok=%s %s",
                operation, uid, costMs, ok, detail == null ? "" : detail.trim());
        if (costMs >= 10_000 || !ok) {
            log.error(msg);
        } else if (costMs >= 3_000) {
            log.warn(msg);
        } else {
            log.debug(msg);
        }
    }

    public static void logScanPhase(String traceId, String phase, long costMs, String detail) {
        String msg = String.format("[扫码·阶段] trace=%s phase=%s ms=%d %s",
                traceId, phase, costMs, detail == null ? "" : detail.trim());
        if (costMs >= 10_000) {
            log.error(msg);
        } else if (costMs >= 3_000) {
            log.warn(msg);
        } else {
            log.info(msg);
        }
    }

    public static void logJob(String jobKey, String trigger, long costMs, boolean ok, String summary) {
        String msg = String.format("[定时·执行] job=%s trigger=%s ms=%d ok=%s %s",
                jobKey, trigger, costMs, ok, summary == null ? "" : abbrev(summary, 200));
        if (costMs >= 10_000 || !ok) {
            log.error(msg);
        } else if (costMs >= 3_000) {
            log.warn(msg);
        } else {
            log.info(msg);
        }
    }

    public static void logDahuaPull(Long taskId, String taskName, long costMs, boolean ok, String detail) {
        String msg = String.format("[大华·拉取] taskId=%s name=%s ms=%d ok=%s %s",
                taskId, abbrev(taskName, 40), costMs, ok, detail == null ? "" : abbrev(detail, 200));
        if (costMs >= 10_000 || !ok) {
            log.error(msg);
        } else if (costMs >= 3_000) {
            log.warn(msg);
        } else {
            log.debug(msg);
        }
    }

    public static void logMysql(String operation, long costMs, boolean ok, String detail) {
        String msg = String.format("[MySQL·耗时] op=%s ms=%d ok=%s %s",
                operation, costMs, ok, detail == null ? "" : detail.trim());
        if (!ok || costMs >= 5_000) {
            log.error(msg);
        } else if (costMs >= 1_000) {
            log.warn(msg);
        } else {
            log.info(msg);
        }
    }

    private static String abbrev(String s, int max) {
        if (s == null) {
            return "";
        }
        String t = s.trim();
        return t.length() <= max ? t : t.substring(0, max) + "…";
    }
}
