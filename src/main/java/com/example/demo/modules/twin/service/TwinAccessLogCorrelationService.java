package com.example.demo.modules.twin.service;

import com.example.demo.modules.aro.dto.AroRecord;
import com.example.demo.modules.twin.entity.TwinAccessCorrelationPending;
import com.example.demo.modules.twin.mapper.TwinAccessCorrelationPendingMapper;
import com.example.demo.modules.twin.mapper.TwinDashboardMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;

/**
 * 将官方拉取落库的流水与孪生侧近期操作（Web 扫码、自动签退等）做批量匹配，写入 {@code aro_access_log.feed_*}，
 * 供瀑布流与「i」溯源展示；未匹配且为近期记录则写入默认兜底文案。
 */
@Service
public class TwinAccessLogCorrelationService {
    private static final Logger log = LoggerFactory.getLogger(TwinAccessLogCorrelationService.class);
    public static final String SOURCE_AUTO_SIGNOUT = "AUTO_SIGNOUT";
    public static final String SOURCE_WEB_SCAN = "WEB_SCAN";

    public static final String FEED_SOURCE_MATCHED_AUTO = "TWIN_AUTO_SIGNOUT";
    public static final String FEED_SOURCE_MATCHED_WEB = "WEB_SCAN";
    public static final String FEED_SOURCE_DEFAULT = "ARO_OFFICIAL_UNMATCHED"; // 展示侧称「官方登记」

    private static final DateTimeFormatter DT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /** 仅尝试与待匹配队列对齐的官方流水：官方时间不早于该窗口则跳过匹配（避免历史洪峰误绑） */
    private static final int MATCH_OFFICIAL_MAX_AGE_HOURS = 72;
    /** 未匹配时写入兜底文案：仅针对近期官方流水，避免历史重建刷库 */
    private static final int DEFAULT_FEED_MAX_AGE_HOURS = 48;

    private final TwinAccessCorrelationPendingMapper pendingMapper;
    private final TwinDashboardMapper dashboardMapper;

    public TwinAccessLogCorrelationService(
            TwinAccessCorrelationPendingMapper pendingMapper,
            TwinDashboardMapper dashboardMapper
    ) {
        this.pendingMapper = pendingMapper;
        this.dashboardMapper = dashboardMapper;
    }

    /**
     * 在孪生调用 ARO save 成功后登记一条待匹配记录（随后官方流水入库时会消费）。
     */
    public void registerPending(
            int accessType,
            String userId,
            String roomId,
            String sourceTag,
            Long automationLogId,
            String summaryZh,
            String detailZh
    ) {
        String uid = nz(userId);
        String rid = nz(roomId);
        if (uid.isEmpty() || rid.isEmpty()) {
            return;
        }
        if (accessType != 1 && accessType != 2) {
            return;
        }
        try {
            TwinAccessCorrelationPending p = new TwinAccessCorrelationPending();
            p.setAccessType(accessType);
            p.setUserId(uid);
            p.setRoomId(rid);
            p.setSourceTag(nz(sourceTag).isEmpty() ? "UNKNOWN" : sourceTag.trim());
            p.setAutomationLogId(automationLogId);
            p.setSummaryZh(trunc(summaryZh, 500));
            p.setDetailZh(trunc(detailZh, 1900));
            p.setOpTime(LocalDateTime.now());
            p.setConsumed(0);
            pendingMapper.insert(p);
        } catch (Exception e) {
            log.debug("[access-correlation] register skip: {}", e.getMessage());
        }
    }

    /**
     * 在 {@code aro_access_log} 批量插入刚拉取的官方记录之后调用：回填 feed_* 并同步内存中的 {@link AroRecord} 便于推送。
     */
    public void reconcileNewOfficialRecords(List<AroRecord> inserted) {
        if (inserted == null || inserted.isEmpty()) {
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        for (AroRecord r : inserted) {
            if (r == null || r.getId() == null) {
                continue;
            }
            String logId = String.valueOf(r.getId());
            if (r.getAccessType() == null) {
                continue;
            }
            int at = r.getAccessType();
            if (at != 1 && at != 2) {
                continue;
            }
            LocalDateTime officialTime = parseOfficialTime(r.getCreateTime());
            if (officialTime == null) {
                continue;
            }
            if (officialTime.isBefore(now.minusHours(MATCH_OFFICIAL_MAX_AGE_HOURS))) {
                continue;
            }

            Map<String, Object> existingRow = dashboardMapper.selectAccessLogFeedById(logId);
            if (existingRow != null) {
                Object fs = existingRow.get("feedSource");
                if (fs != null && !String.valueOf(fs).trim().isEmpty()) {
                    r.setFeedSource(String.valueOf(fs).trim());
                    Object s = existingRow.get("feedSummaryZh");
                    if (s != null) {
                        r.setFeedSummaryZh(String.valueOf(s));
                    }
                    Object d = existingRow.get("feedDetailZh");
                    if (d != null) {
                        r.setFeedDetailZh(String.valueOf(d));
                    }
                    Object dev = existingRow.get("deviceDisplayName");
                    if (dev != null) {
                        r.setDeviceDisplayName(String.valueOf(dev));
                    }
                    continue;
                }
            }

            String uid = nz(r.getUserId());
            String rid = nz(r.getRoomId());
            if (uid.isEmpty() || rid.isEmpty()) {
                maybeApplyDefault(logId, r, at, officialTime, now);
                continue;
            }

            boolean feedAlready = r.getFeedSource() != null && !r.getFeedSource().isBlank();
            if (feedAlready) {
                continue;
            }

            LocalDateTime opMin = officialTime.minusMinutes(45);
            LocalDateTime opMax = officialTime.plusMinutes(25);
            TwinAccessCorrelationPending pend = pendingMapper.selectOldestMatching(uid, rid, at, opMin, opMax);
            if (pend != null) {
                String feedSource = mapSourceToFeedSource(pend.getSourceTag());
                String sum = nz(pend.getSummaryZh());
                if (sum.isEmpty()) {
                    sum = at == 1 ? "孪生系统·进入登记" : "孪生系统·离开登记";
                }
                String det = buildMatchedDetail(pend, r);
                try {
                    dashboardMapper.updateAccessLogFeedProvenance(logId, feedSource, sum, det, null);
                    pendingMapper.markConsumed(pend.getId());
                    r.setFeedSource(feedSource);
                    r.setFeedSummaryZh(sum);
                    r.setFeedDetailZh(det);
                } catch (Exception e) {
                    log.warn("[access-correlation] update matched failed id={} err={}", logId, e.getMessage());
                }
            } else {
                maybeApplyDefault(logId, r, at, officialTime, now);
            }
        }
    }

    private void maybeApplyDefault(String logId, AroRecord r, int accessType, LocalDateTime officialTime, LocalDateTime now) {
        if (officialTime.isBefore(now.minusHours(DEFAULT_FEED_MAX_AGE_HOURS))) {
            return;
        }
        boolean feedAlready = r.getFeedSource() != null && !r.getFeedSource().isBlank();
        if (feedAlready) {
            return;
        }
        String sum = accessType == 1 ? "官方登记·进入" : "官方登记·离开";
        String det = "未与孪生侧扫码或自动签退等登记绑定；按官方登记展示。";
        try {
            int n = dashboardMapper.updateAccessLogFeedProvenanceIfBlank(
                    logId,
                    FEED_SOURCE_DEFAULT,
                    sum,
                    det,
                    null
            );
            if (n > 0) {
                r.setFeedSource(FEED_SOURCE_DEFAULT);
                r.setFeedSummaryZh(sum);
                r.setFeedDetailZh(det);
            }
        } catch (Exception e) {
            log.warn("[access-correlation] default feed failed id={} err={}", logId, e.getMessage());
        }
    }

    private static String buildMatchedDetail(TwinAccessCorrelationPending pend, AroRecord official) {
        StringBuilder sb = new StringBuilder();
        if (pend.getSummaryZh() != null && !pend.getSummaryZh().isBlank()) {
            sb.append(pend.getSummaryZh().trim());
        } else {
            sb.append("已与孪生登记对齐");
        }
        if (official.getRoomName() != null && !official.getRoomName().isBlank()) {
            sb.append("（").append(official.getRoomName().trim()).append("）");
        }
        sb.append("。");
        String dz = pend.getDetailZh() == null ? "" : pend.getDetailZh().trim();
        if (!dz.isEmpty()) {
            sb.append(" 自动化联动说明：").append(dz);
        }
        return trunc(sb.toString(), 1900);
    }

    private static String mapSourceToFeedSource(String tag) {
        if (tag == null) {
            return FEED_SOURCE_MATCHED_AUTO;
        }
        if (SOURCE_WEB_SCAN.equalsIgnoreCase(tag.trim())) {
            return FEED_SOURCE_MATCHED_WEB;
        }
        if (SOURCE_AUTO_SIGNOUT.equalsIgnoreCase(tag.trim())) {
            return FEED_SOURCE_MATCHED_AUTO;
        }
        return "TWIN_" + tag.trim();
    }

    private static LocalDateTime parseOfficialTime(String createTime) {
        if (createTime == null || createTime.isBlank()) {
            return null;
        }
        String v = createTime.trim();
        try {
            if (v.length() == 10) {
                v = v + " 00:00:00";
            }
            return LocalDateTime.parse(v, DT);
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    private static String nz(String s) {
        return s == null ? "" : s.trim();
    }

    private static String trunc(String s, int max) {
        if (s == null) {
            return null;
        }
        if (s.length() <= max) {
            return s;
        }
        return s.substring(0, max);
    }
}
