package com.example.demo.modules.student.service;

import com.example.demo.modules.material.entity.MaterialRequest;
import com.example.demo.modules.material.mapper.MaterialRequestMapper;
import com.example.demo.modules.notification.entity.StudentNotification;
import com.example.demo.modules.notification.mapper.StudentNotificationMapper;
import com.example.demo.modules.roommapping.entity.RoomMappingRoom;
import com.example.demo.modules.roommapping.mapper.RoomMappingRoomMapper;
import com.example.demo.modules.twin.card.entity.TwinCardMapping;
import com.example.demo.modules.twin.card.service.TwinCardMappingService;
import com.example.demo.modules.twin.common.service.RoomDictionaryManager;
import com.example.demo.modules.twin.dashboard.entity.TwinScanPopupAnnouncement;
import com.example.demo.modules.twin.dashboard.dto.ScanStudentViolationNoticeDTO;
import com.example.demo.modules.twin.dashboard.entity.TwinStudentViolation;
import com.example.demo.modules.twin.dashboard.mapper.TwinScanPopupAnnouncementMapper;
import com.example.demo.modules.twin.dashboard.mapper.TwinStudentViolationMapper;
import com.example.demo.modules.twin.dashboard.service.TwinStudentViolationService;
import com.example.demo.modules.twin.scan.delay.entity.TwinScanDelayOption;
import com.example.demo.modules.twin.scan.delay.entity.TwinScanDelayRequest;
import com.example.demo.modules.twin.scan.delay.mapper.TwinScanDelayRequestMapper;
import com.example.demo.modules.twin.scan.delay.service.ScanDelayConfigService;
import com.example.demo.modules.twin.scan.service.TwinScanNoticeAutoSuppressService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.Set;

/**
 * 手机 HTML5 通知聚合：公告、违规、豁免状态、物资/延迟审核反馈。
 */
@Service
public class MobileCenterAlertService {

    private static final Logger log = LoggerFactory.getLogger(MobileCenterAlertService.class);
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final TwinScanPopupAnnouncementMapper announcementMapper;
    private final TwinStudentViolationMapper violationMapper;
    private final TwinStudentViolationService twinStudentViolationService;
    private final TwinCardMappingService cardMappingService;
    private final RoomMappingRoomMapper roomMappingRoomMapper;
    private final RoomDictionaryManager roomDictionaryManager;
    private final StudentNotificationMapper studentNotificationMapper;
    private final TwinScanDelayRequestMapper scanDelayRequestMapper;
    private final ScanDelayConfigService scanDelayConfigService;
    private final MaterialRequestMapper materialRequestMapper;
    private final TwinScanNoticeAutoSuppressService scanNoticeAutoSuppressService;

    public MobileCenterAlertService(TwinScanPopupAnnouncementMapper announcementMapper,
                                    TwinStudentViolationMapper violationMapper,
                                    TwinStudentViolationService twinStudentViolationService,
                                    TwinCardMappingService cardMappingService,
                                    RoomMappingRoomMapper roomMappingRoomMapper,
                                    RoomDictionaryManager roomDictionaryManager,
                                    StudentNotificationMapper studentNotificationMapper,
                                    TwinScanDelayRequestMapper scanDelayRequestMapper,
                                    ScanDelayConfigService scanDelayConfigService,
                                    MaterialRequestMapper materialRequestMapper,
                                    TwinScanNoticeAutoSuppressService scanNoticeAutoSuppressService) {
        this.announcementMapper = announcementMapper;
        this.violationMapper = violationMapper;
        this.twinStudentViolationService = twinStudentViolationService;
        this.cardMappingService = cardMappingService;
        this.roomMappingRoomMapper = roomMappingRoomMapper;
        this.roomDictionaryManager = roomDictionaryManager;
        this.studentNotificationMapper = studentNotificationMapper;
        this.scanDelayRequestMapper = scanDelayRequestMapper;
        this.scanDelayConfigService = scanDelayConfigService;
        this.materialRequestMapper = materialRequestMapper;
        this.scanNoticeAutoSuppressService = scanNoticeAutoSuppressService;
    }

    public Map<String, Object> buildAlerts(String userId, boolean html5PrivilegeBypass) {
        Set<String> suppressKeys = scanNoticeAutoSuppressService.suppressKeysForUser(userId);
        List<Map<String, Object>> announcements = new ArrayList<>();
        appendAnnouncements(announcements, suppressKeys);
        appendExemptAlert(userId, announcements);
        appendViolationAlert(userId, html5PrivilegeBypass, announcements, suppressKeys);

        List<Map<String, Object>> feedbacks = new ArrayList<>();
        appendStudentWorkOrderAlerts(userId, feedbacks);
        appendMaterialRequestAlerts(userId, feedbacks);
        appendScanDelayStatusAlerts(userId, feedbacks);
        dedupeFeedbackItems(feedbacks);

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("announcements", announcements);
        resp.put("feedbacks", feedbacks);
        resp.put("items", announcements);
        resp.put("totalCount", announcements.size() + feedbacks.size());
        resp.put("html5PrivilegeBypass", html5PrivilegeBypass);
        return resp;
    }

    /** 手机 H5：与扫码弹窗共用「下次不再自动弹出」持久化 */
    public Map<String, Object> suppressNoticeAutoOpen(String userId, String noticeKind, long recordId) {
        scanNoticeAutoSuppressService.suppressForScannedUser(userId, noticeKind, recordId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("targetUserId", userId);
        out.put("noticeKind", noticeKind);
        out.put("recordId", recordId);
        out.put("autoOpenSuppressed", true);
        return out;
    }

    /** 构建单条豁免通知（供 WebSocket 增量推送） */
    public Map<String, Object> buildExemptAlertItem(String userId) {
        TwinCardMapping mapping = cardMappingService.getByAroUserId(userId);
        if (!cardMappingService.isFreezeExempt(mapping)) {
            return null;
        }
        return buildExemptItem(mapping);
    }

    private void appendAnnouncements(List<Map<String, Object>> items, Set<String> suppressKeys) {
        try {
            List<TwinScanPopupAnnouncement> announcements = announcementMapper.selectActiveForScan(30);
            if (announcements == null) {
                return;
            }
            for (TwinScanPopupAnnouncement a : announcements) {
                Map<String, Object> item = baseItem("announcement", a.getId(), a.getTitle(), false);
                item.put("contentHtml", a.getContentHtml() != null ? a.getContentHtml() : "");
                item.put("publishAt", a.getPublishAt() != null ? a.getPublishAt().toString() : null);
                item.put("expireAt", a.getExpireAt() != null ? a.getExpireAt().toString() : null);
                if (a.getId() != null && suppressKeys.contains("announcement:" + a.getId())) {
                    item.put("autoOpenSuppressed", true);
                }
                items.add(item);
            }
        } catch (Exception e) {
            log.warn("[MobileAlerts] 公告查询失败: {}", e.getMessage());
        }
    }

    private void appendExemptAlert(String userId, List<Map<String, Object>> items) {
        try {
            Map<String, Object> exempt = buildExemptAlertItem(userId);
            if (exempt != null) {
                items.add(exempt);
            }
        } catch (Exception e) {
            log.warn("[MobileAlerts] 豁免查询失败 userId={}: {}", userId, e.getMessage());
        }
    }

    private Map<String, Object> buildExemptItem(TwinCardMapping mapping) {
        String mode = mapping.getFreezeExemptMode() != null ? mapping.getFreezeExemptMode() : "TIME";
        String modeLabel = switch (mode) {
            case "COUNT" -> "按次数";
            case "BOTH" -> "时效+次数";
            default -> "按时效";
        };
        List<String> roomIds = parseRoomIds(mapping.getFreezeExemptRoomIds());
        String roomNames = resolveRoomNames(roomIds);
        StringBuilder html = new StringBuilder();
        html.append("<p><strong>免冻结豁免</strong>（").append(escapeHtml(modeLabel)).append("）</p>");
        if (StringUtils.hasText(mapping.getFreezeExemptExpireAt())) {
            html.append("<p>有效期至：").append(escapeHtml(mapping.getFreezeExemptExpireAt())).append("</p>");
        }
        if ("COUNT".equals(mode) || "BOTH".equals(mode)) {
            int used = mapping.getFreezeExemptUsedCount() != null ? mapping.getFreezeExemptUsedCount() : 0;
            Integer max = mapping.getFreezeExemptMaxCount();
            if (max != null && max > 0) {
                html.append("<p>剩余次数：").append(Math.max(0, max - used)).append(" / ").append(max).append("</p>");
            }
        }
        if (StringUtils.hasText(roomNames)) {
            html.append("<p>授权房间：").append(escapeHtml(roomNames)).append("</p>");
        } else if (!roomIds.isEmpty()) {
            html.append("<p>授权房间数：").append(roomIds.size()).append("</p>");
        } else {
            html.append("<p>授权范围：全部可进房间</p>");
        }

        Map<String, Object> item = baseItem("exempt", 0L, "您当前享有免冻结豁免", false);
        item.put("contentHtml", html.toString());
        item.put("createdAt", mapping.getExemptGrantedAt() != null ? mapping.getExemptGrantedAt()
                : mapping.getLastModifiedTime());
        return item;
    }

    private void appendStudentWorkOrderAlerts(String userId, List<Map<String, Object>> items) {
        try {
            List<StudentNotification> rows = studentNotificationMapper.listForUser(
                    userId, "WORK_ORDER", null, 0, 20);
            if (rows == null) {
                return;
            }
            for (StudentNotification sn : rows) {
                String biz = sn.getBizType() != null ? sn.getBizType().trim().toUpperCase() : "";
                if (!"MATERIAL_REQUEST".equals(biz) && !"SCAN_DELAY".equals(biz)) {
                    continue;
                }
                String kind = "MATERIAL_REQUEST".equals(biz) ? "material_feedback" : "scan_delay_feedback";
                Map<String, Object> item = baseItem(kind, sn.getId(), sn.getTitle(), false);
                item.put("contentHtml", wrapPlainSummary(sn.getSummary()));
                item.put("bizType", biz);
                item.put("bizId", sn.getBizId());
                item.put("notificationId", sn.getId());
                item.put("isRead", sn.getIsRead() != null && sn.getIsRead() == 1);
                item.put("createdAt", sn.getCreateTime() != null ? sn.getCreateTime().format(FMT) : null);
                items.add(item);
            }
        } catch (Exception e) {
            log.warn("[MobileAlerts] 学生工单通知失败 userId={}: {}", userId, e.getMessage());
        }
    }

    /** 物资申领审核反馈（按 userId 直查，兼容非 STUDENT 角色申请人） */
    private void appendMaterialRequestAlerts(String userId, List<Map<String, Object>> items) {
        try {
            List<MaterialRequest> rows = materialRequestMapper.selectByUserId(userId, null, 0, 30);
            if (rows == null) {
                return;
            }
            for (MaterialRequest req : rows) {
                if (req == null || req.getId() == null) {
                    continue;
                }
                String status = req.getStatus() != null ? req.getStatus().trim().toUpperCase() : "";
                if ("DRAFT".equals(status)) {
                    continue;
                }
                String title;
                String html;
                switch (status) {
                    case "PENDING", "FIRST_OK" -> {
                        title = "物资申领审核中";
                        html = "<p>申领单 " + escapeHtml(req.getId()) + "</p><p>状态：等待教职工审核</p>";
                    }
                    case "REJECTED" -> {
                        title = "物资申领已拒绝";
                        html = "<p>申领单 " + escapeHtml(req.getId()) + "</p><p>审核未通过</p>";
                    }
                    case "APPROVED", "FULFILLED", "RECEIVED" -> {
                        title = "物资申领已通过";
                        html = "<p>申领单 " + escapeHtml(req.getId()) + "</p><p>审核通过"
                                + ("FULFILLED".equals(status) || "RECEIVED".equals(status) ? "，已出库" : "")
                                + "</p>";
                    }
                    default -> {
                        continue;
                    }
                }
                Map<String, Object> item = baseItem("material_feedback", req.getId(), title, false);
                item.put("contentHtml", html);
                item.put("bizType", "MATERIAL_REQUEST");
                item.put("bizId", req.getId());
                item.put("status", status);
                item.put("isRead", true); // 物资申领无独立已读状态，默认已读
                LocalDateTime ts = req.getUpdatedAt() != null ? req.getUpdatedAt() : req.getCreatedAt();
                item.put("createdAt", ts != null ? ts.format(FMT) : null);
                items.add(item);
            }
        } catch (Exception e) {
            log.warn("[MobileAlerts] 物资申领反馈失败 userId={}: {}", userId, e.getMessage());
        }
    }

    /** 延迟申请全状态（主体用户；与站内通知去重） */
    private void appendScanDelayStatusAlerts(String userId, List<Map<String, Object>> items) {
        try {
            List<TwinScanDelayRequest> rows = scanDelayRequestMapper.listRecentBySubjectUserId(userId, 10);
            if (rows == null) {
                return;
            }
            for (TwinScanDelayRequest req : rows) {
                if (req == null || req.getId() == null) {
                    continue;
                }
                String status = req.getStatus() != null ? req.getStatus().trim().toUpperCase() : "";
                if (!"PENDING".equals(status) && !"APPROVED".equals(status) && !"REJECTED".equals(status)) {
                    continue;
                }
                TwinScanDelayOption opt = scanDelayConfigService.requireOptionQuiet(req.getOptionId());
                String optionLabel = opt != null && StringUtils.hasText(opt.getOptionLabel())
                        ? opt.getOptionLabel() : "延迟免冻结";
                String roomLabel = resolveRoomDisplayName(req.getRoomId(), opt);
                String title;
                String html;
                if ("PENDING".equals(status)) {
                    title = "延迟申请审核中";
                    html = "<p>" + escapeHtml(optionLabel) + " · " + escapeHtml(roomLabel)
                            + "</p><p>状态：等待教职工审核</p>";
                } else if ("APPROVED".equals(status)) {
                    title = "延迟申请已通过";
                    html = "<p>" + escapeHtml(optionLabel) + " · " + escapeHtml(roomLabel)
                            + "</p><p>已授予免冻结豁免</p>";
                } else {
                    title = "延迟申请已拒绝";
                    html = "<p>" + escapeHtml(optionLabel) + " · " + escapeHtml(roomLabel) + "</p>";
                    if (StringUtils.hasText(req.getRejectReason())) {
                        html += "<p>原因：" + escapeHtml(req.getRejectReason()) + "</p>";
                    }
                }
                Map<String, Object> item = baseItem("scan_delay_feedback", req.getId(), title, false);
                item.put("contentHtml", html);
                item.put("bizType", "SCAN_DELAY");
                item.put("bizId", String.valueOf(req.getId()));
                item.put("status", status);
                item.put("isRead", true); // 延迟申请无独立已读状态，默认已读
                LocalDateTime ts = req.getReviewedAt() != null ? req.getReviewedAt() : req.getCreatedAt();
                item.put("createdAt", ts != null ? ts.format(FMT) : null);
                items.add(item);
            }
        } catch (Exception e) {
            log.warn("[MobileAlerts] 延迟申请状态失败 userId={}: {}", userId, e.getMessage());
        }
    }

    /** 同一 bizType+bizId 保留最新一条（站内通知优先于 DB 快照） */
    private void dedupeFeedbackItems(List<Map<String, Object>> items) {
        if (items == null || items.size() <= 1) {
            return;
        }
        Map<String, Map<String, Object>> latest = new LinkedHashMap<>();
        for (Map<String, Object> item : items) {
            String kind = String.valueOf(item.getOrDefault("kind", ""));
            String bizType = String.valueOf(item.getOrDefault("bizType", ""));
            String bizId = String.valueOf(item.getOrDefault("bizId", item.get("id")));
            String key = kind + "|" + bizType + "|" + bizId;
            if (!latest.containsKey(key) || item.containsKey("notificationId")) {
                latest.put(key, item);
            }
        }
        items.clear();
        items.addAll(latest.values());
        items.sort((a, b) -> {
            String ta = String.valueOf(a.getOrDefault("createdAt", ""));
            String tb = String.valueOf(b.getOrDefault("createdAt", ""));
            return tb.compareTo(ta);
        });
    }

    private void appendViolationAlert(String userId, boolean html5Privilege, List<Map<String, Object>> items,
                                    Set<String> suppressKeys) {
        try {
            ScanStudentViolationNoticeDTO notice = twinStudentViolationService.buildNotice(userId);
            if (notice == null || notice.getId() == null) {
                return;
            }
            TwinStudentViolation activeViolation = violationMapper.selectActiveByTargetUserId(userId);
            String body = Boolean.TRUE.equals(notice.getCritical())
                    && StringUtils.hasText(notice.getCriticalNoticeText())
                    ? notice.getCriticalNoticeText()
                    : notice.getViolationText();
            Map<String, Object> item = baseItem("violation", notice.getId(), "违规提醒", false);
            item.put("contentHtml", body != null ? body : "");
            item.put("createdAt", activeViolation != null && activeViolation.getCreatedAt() != null
                    ? activeViolation.getCreatedAt().toString() : null);
            if (suppressKeys.contains("violation:" + notice.getId())) {
                item.put("autoOpenSuppressed", true);
            }
            boolean hasChallenge = StringUtils.hasText(notice.getInteractiveChallenge());
            boolean interactiveVerified = Boolean.TRUE.equals(notice.getInteractiveChallengeVerified());
            boolean interactive = !html5Privilege && hasChallenge && !interactiveVerified;
            item.put("interactiveRequired", interactive);
            item.put("interactiveChallengeVerified", interactiveVerified);
            if (hasChallenge) {
                item.put("interactiveChallenge", notice.getInteractiveChallenge());
            }
            item.put("enterLocked", notice.getEnterLocked());
            item.put("canSelfUnblock", notice.getCanSelfUnblock());
            if (StringUtils.hasText(notice.getUnblockMethod())) {
                item.put("unblockMethod", notice.getUnblockMethod().trim());
            }
            items.add(item);
        } catch (Exception e) {
            log.warn("[MobileAlerts] 违规查询失败: {}", e.getMessage());
        }
    }

    private Map<String, Object> baseItem(String kind, Object id, String title, boolean interactiveRequired) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("kind", kind);
        item.put("id", id);
        item.put("title", title != null ? title : "");
        item.put("contentHtml", "");
        item.put("interactiveRequired", interactiveRequired);
        return item;
    }

    private String wrapPlainSummary(String summary) {
        if (!StringUtils.hasText(summary)) {
            return "";
        }
        return "<p>" + escapeHtml(summary.trim()) + "</p>";
    }

    private List<String> parseRoomIds(String roomIdsJson) {
        if (!StringUtils.hasText(roomIdsJson)) {
            return List.of();
        }
        try {
            com.alibaba.fastjson2.JSONArray arr = com.alibaba.fastjson2.JSON.parseArray(roomIdsJson);
            if (arr == null || arr.isEmpty()) {
                return List.of();
            }
            List<String> out = new ArrayList<>();
            for (int i = 0; i < arr.size(); i++) {
                Object item = arr.get(i);
                if (item == null) {
                    continue;
                }
                String id = String.valueOf(item).trim();
                if (!id.isEmpty()) {
                    out.add(id);
                }
            }
            return out;
        } catch (Exception e) {
            return List.of();
        }
    }

    private String resolveRoomNames(List<String> roomIds) {
        if (roomIds == null || roomIds.isEmpty()) {
            return "";
        }
        List<String> names = new ArrayList<>();
        for (String roomId : roomIds) {
            String label = resolveRoomDisplayName(roomId, null);
            if (StringUtils.hasText(label) && !names.contains(label)) {
                names.add(label);
            }
        }
        return String.join("、", names);
    }

    private String resolveRoomDisplayName(String roomId, TwinScanDelayOption opt) {
        if (StringUtils.hasText(roomId)) {
            String rid = roomId.trim();
            try {
                RoomDictionaryManager.RoomMapping mapped = roomDictionaryManager.translate(rid);
                if (mapped != null && StringUtils.hasText(mapped.displayName)) {
                    return mapped.displayName.trim();
                }
            } catch (Exception ignored) {
                // fallback
            }
            try {
                RoomMappingRoom catalog = roomMappingRoomMapper.selectByRoomId(rid);
                if (catalog != null && StringUtils.hasText(catalog.getRoomName())) {
                    return catalog.getRoomName().trim();
                }
            } catch (Exception ignored) {
                // fallback
            }
        }
        if (opt != null && StringUtils.hasText(opt.getRoomName())) {
            return opt.getRoomName().trim();
        }
        return StringUtils.hasText(roomId) ? roomId.trim() : "未知房间";
    }

    private static String escapeHtml(String s) {
        if (s == null) {
            return "";
        }
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("\"", "&quot;").replace("'", "&#39;");
    }
}
