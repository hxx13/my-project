package com.example.demo.modules.twin.support;

import com.example.demo.common.dto.UniversalEvent;
import com.example.demo.modules.aro.dto.AroRecord;

/**
 * 进出流水溯源：优先使用库表字段，否则生成保守的中文说明（不臆造门禁名等）。
 */
public final class AccessLogFeedProvenanceBuilder {

    private AccessLogFeedProvenanceBuilder() {
    }

    public static UniversalEvent.FeedProvenance fromAroRecord(AroRecord record) {
        UniversalEvent.FeedProvenance p = new UniversalEvent.FeedProvenance();
        if (record == null) {
            p.setChannel("UNKNOWN");
            p.setSummaryZh("无溯源信息");
            p.setDetailZh("");
            return p;
        }
        String src = trim(record.getFeedSource());
        String sum = trim(record.getFeedSummaryZh());
        String det = trim(record.getFeedDetailZh());
        String dev = trim(record.getDeviceDisplayName());
        if (!sum.isEmpty() || !src.isEmpty()) {
            p.setChannel(!src.isEmpty() ? src : "ARO_OFFICIAL");
            p.setSummaryZh(!sum.isEmpty() ? sum : defaultSummary(record, p.getChannel()));
            p.setDetailZh(buildDetail(det, record, dev));
            p.setDoorName(dev);
            return p;
        }
        p.setChannel("ARO_OFFICIAL");
        p.setSummaryZh(defaultSummary(record, "ARO_OFFICIAL"));
        p.setDetailZh(buildDetail("", record, dev));
        p.setDoorName(dev);
        return p;
    }

    private static String defaultSummary(AroRecord record, String channel) {
        Integer at = record.getAccessType();
        // 与 AroSyncTask.pushToFrontend 一致：1=ENTER 进入，2=EXIT 离开，0=WARN 在场未出
        String act = at != null && at == 1 ? "进入" : at != null && at == 2 ? "离开" : at != null && at == 0 ? "在场未出" : "通行";
        if ("WEB_SCAN".equalsIgnoreCase(channel)) {
            return "Web扫码" + act;
        }
        return "ARO同步·" + act;
    }

    private static String buildDetail(String baseDetail, AroRecord record, String deviceName) {
        StringBuilder sb = new StringBuilder();
        if (baseDetail != null && !baseDetail.isBlank()) {
            sb.append(baseDetail.trim());
        } else {
            sb.append("数据来源：ARO 官方进出流水同步至本地库。");
        }
        sb.append("\n");
        if (deviceName != null && !deviceName.isBlank()) {
            sb.append("关联设备/门禁：").append(deviceName).append("\n");
        }
        appendFlag(sb, "领用卡", record.getIsBorrowedCard());
        appendFlag(sb, "共享卡", record.getIsSharedCard());
        appendFlag(sb, "保管卡", record.getIsKeepCard());
        return sb.toString().trim();
    }

    private static void appendFlag(StringBuilder sb, String label, Integer v) {
        if (v != null && v == 1) {
            sb.append("标记：").append(label).append("。\n");
        }
    }

    private static String trim(String s) {
        return s == null ? "" : s.trim();
    }
}
