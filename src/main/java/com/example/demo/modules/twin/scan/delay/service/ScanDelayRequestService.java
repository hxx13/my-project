package com.example.demo.modules.twin.scan.delay.service;

import com.example.demo.common.time.BusinessTimeWindow;
import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.notification.dto.PublishNotificationEvent;
import com.example.demo.modules.notification.service.NotificationService;
import com.example.demo.modules.student.service.MobilePresenceNotifyService;
import com.example.demo.modules.roommapping.entity.RoomMappingRoom;
import com.example.demo.modules.roommapping.mapper.RoomMappingRoomMapper;
import com.example.demo.modules.twin.common.service.RoomDictionaryManager;
import com.example.demo.modules.twin.common.util.PersonnelProjectGroupUtil;
import com.example.demo.modules.twin.card.entity.TwinCardMapping;
import com.example.demo.modules.twin.card.service.TwinCardMappingService;
import com.example.demo.modules.twin.scan.delay.entity.TwinScanDelayOption;
import com.example.demo.modules.twin.scan.delay.entity.TwinScanDelayRequest;
import com.example.demo.modules.twin.scan.delay.mapper.TwinScanDelayRequestMapper;
import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class ScanDelayRequestService {
    private static final Logger log = LoggerFactory.getLogger(ScanDelayRequestService.class);

    @Autowired
    private ScanDelayConfigService configService;

    @Autowired
    private TwinScanDelayRequestMapper requestMapper;

    @Autowired
    private TwinCardMappingService cardMappingService;

    @Autowired
    private NotificationService notificationService;

    @Autowired
    @Lazy
    private ScanDelayAutoApproveService autoApproveService;

    @Autowired
    private UserDisplayNameService userDisplayNameService;

    @Autowired
    private AroPersonnelMapper aroPersonnelMapper;

    @Autowired
    private UserMapper userMapper;

    @Autowired
    private RoomMappingRoomMapper roomMappingRoomMapper;

    @Autowired
    private RoomDictionaryManager roomDictionaryManager;

    @Autowired
    private MobilePresenceNotifyService mobilePresenceNotifyService;

    @Transactional
    public Map<String, Object> submitRequest(
            String subjectUserId,
            String roomId,
            Long optionId,
            String reviewerUserId,
            String operatorUserId
    ) {
        if (!configService.isMasterEnabled()) {
            throw new IllegalArgumentException("延迟免冻结功能未开启");
        }
        if (!StringUtils.hasText(subjectUserId) || !StringUtils.hasText(roomId) || optionId == null) {
            throw new IllegalArgumentException("参数不完整");
        }
        TwinScanDelayOption opt = configService.requireOption(optionId);
        if (!configService.isOptionBoundToRoom(roomId.trim(), optionId)) {
            throw new IllegalArgumentException("该房间未配置此延迟选项");
        }
        TwinCardMapping mapping = cardMappingService.getByAroUserId(subjectUserId.trim());
        if (mapping == null || !StringUtils.hasText(mapping.getCardNo())) {
            throw new IllegalArgumentException("未找到该人员的物理卡映射，无法授予免冻结");
        }
        String cardNo = mapping.getCardNo().trim();
        boolean needApproval = opt.getRequireApproval() != null && opt.getRequireApproval() == 1;
        if (needApproval) {
            List<String> configuredReviewers = resolveConfiguredCanonicalReviewerIds(opt);
            if (configuredReviewers.isEmpty()) {
                throw new IllegalArgumentException("该延迟规则未配置审核教职工");
            }
            TwinScanDelayRequest req = new TwinScanDelayRequest();
            req.setSubjectUserId(subjectUserId.trim());
            req.setCardNo(cardNo);
            req.setRoomId(roomId.trim());
            req.setOptionId(optionId);
            req.setDurationMinutes(opt.getDurationMinutes());
            // 仅存首位审核人作审计字段；待审可见性由规则 reviewer_user_ids 决定
            req.setReviewerUserId(configuredReviewers.get(0));
            req.setStatus("PENDING");
            req.setRequestedBy(operatorUserId);
            req.setCreatedAt(LocalDateTime.now());
            requestMapper.insert(req);
            notifyConfiguredReviewers(req, opt, configuredReviewers);
            if (mobilePresenceNotifyService != null) {
                mobilePresenceNotifyService.notifyPresenceChanged(subjectUserId.trim(), "scan_delay_pending");
            }
            try {
                autoApproveService.tryTrustOnSubmit(req.getId());
            } catch (Exception e) {
                log.warn("[scan-delay] auto trust on submit skip: {}", e.getMessage());
            }
            Map<String, Object> out = new HashMap<>();
            out.put("status", "PENDING");
            out.put("requestId", req.getId());
            out.put("message", "已提交审核，等待教职工确认");
            return out;
        }
        Map<String, Object> granted = grantExempt(cardNo, opt, roomId.trim(), "DIRECT");
        if (mobilePresenceNotifyService != null) {
            mobilePresenceNotifyService.notifyPresenceChanged(subjectUserId.trim(), "scan_delay_granted");
        }
        return granted;
    }

    @Transactional
    public Map<String, Object> reviewRequest(Long requestId, boolean approve, String reviewerUserId, String rejectReason) {
        if (requestId == null || !StringUtils.hasText(reviewerUserId)) {
            throw new IllegalArgumentException("参数不完整");
        }
        TwinScanDelayRequest req = requestMapper.findById(requestId);
        if (req == null) throw new IllegalArgumentException("申请不存在");
        if (!"PENDING".equalsIgnoreCase(req.getStatus())) {
            throw new IllegalArgumentException("申请已处理");
        }
        if (!canUserReviewDelayRequest(reviewerUserId, req)) {
            throw new IllegalArgumentException("无权审核该申请");
        }
        LocalDateTime reviewedAt = LocalDateTime.now();
        if (!approve) {
            requestMapper.updateStatus(requestId, "REJECTED", reviewerUserId.trim(), rejectReason, reviewedAt);
            notifySubjectOnReview(req, configService.requireOptionQuiet(req.getOptionId()), false, rejectReason, reviewerUserId.trim());
            if (mobilePresenceNotifyService != null && StringUtils.hasText(req.getSubjectUserId())) {
                mobilePresenceNotifyService.notifyPresenceChanged(req.getSubjectUserId().trim(), "scan_delay_rejected");
            }
            Map<String, Object> out = new HashMap<>();
            out.put("status", "REJECTED");
            out.put("requestId", requestId);
            return out;
        }
        TwinScanDelayOption opt = configService.requireOptionEnabled(req.getOptionId());
        if (!configService.isOptionBoundToRoom(req.getRoomId(), req.getOptionId())) {
            throw new IllegalArgumentException("该房间未配置此延迟选项");
        }
        Map<String, Object> granted = grantExempt(req.getCardNo(), opt, req.getRoomId(), "APPROVED");
        requestMapper.updateStatus(requestId, "APPROVED", reviewerUserId.trim(), null, reviewedAt);
        notifySubjectOnReview(req, opt, true, null, reviewerUserId.trim());
        if (mobilePresenceNotifyService != null && StringUtils.hasText(req.getSubjectUserId())) {
            mobilePresenceNotifyService.notifyPresenceChanged(req.getSubjectUserId().trim(), "scan_delay_granted");
        }
        granted.put("requestId", requestId);
        granted.put("status", "APPROVED");
        return granted;
    }

    public List<TwinScanDelayRequest> listMyPendingReviews(String reviewerUserId) {
        if (!StringUtils.hasText(reviewerUserId)) return List.of();
        String canonical = resolveCanonicalUserId(reviewerUserId);
        if (!StringUtils.hasText(canonical)) return List.of();
        List<TwinScanDelayRequest> out = new ArrayList<>();
        for (TwinScanDelayRequest row : requestMapper.listAllPending(200)) {
            if (row == null || row.getId() == null) continue;
            if (canUserSeePendingDelayRequest(canonical, row)) {
                out.add(row);
            }
        }
        return out;
    }

    /** 规则内审核人可见；规则缺失时回退到单据上的 reviewer_user_id */
    private boolean canUserSeePendingDelayRequest(String canonicalReviewerId, TwinScanDelayRequest row) {
        if (!StringUtils.hasText(canonicalReviewerId) || row == null) return false;
        TwinScanDelayOption opt = configService.requireOptionQuiet(row.getOptionId());
        if (isConfiguredReviewerForOption(opt, canonicalReviewerId)) {
            return true;
        }
        return StringUtils.hasText(row.getReviewerUserId())
                && canonicalReviewerId.equals(resolveCanonicalUserId(row.getReviewerUserId()));
    }

    /** 已审结延迟申请（教职工均可查看历史） */
    public List<Map<String, Object>> listReviewedHistoryEnriched(int limit) {
        List<TwinScanDelayRequest> rows = requestMapper.listReviewedHistory(Math.max(1, Math.min(limit, 200)));
        if (rows.isEmpty()) return List.of();
        Set<String> subjectIds = rows.stream()
                .map(TwinScanDelayRequest::getSubjectUserId)
                .filter(StringUtils::hasText)
                .map(String::trim)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        Map<String, String> displayNames = userDisplayNameService.resolveDisplayNames(subjectIds);
        List<Map<String, Object>> out = new ArrayList<>();
        for (TwinScanDelayRequest req : rows) {
            TwinScanDelayOption opt = configService.requireOptionQuiet(req.getOptionId());
            String subjectId = req.getSubjectUserId() != null ? req.getSubjectUserId().trim() : "";
            Map<String, Object> row = new HashMap<>();
            row.put("id", req.getId());
            row.put("subjectUserId", subjectId);
            row.put("subjectDisplayName", displayNames.getOrDefault(subjectId, subjectId));
            row.put("subjectGroupName", resolveSubjectGroup(subjectId));
            row.put("roomId", req.getRoomId());
            row.put("optionId", req.getOptionId());
            row.put("status", req.getStatus());
            row.put("createdAt", formatWallClock(req.getCreatedAt()));
            row.put("reviewedAt", formatWallClock(req.getReviewedAt()));
            row.put("reviewedBy", req.getReviewedBy());
            row.put("rejectReason", req.getRejectReason());
            row.put("optionLabel", opt != null ? opt.getOptionLabel() : "");
            row.put("roomName", resolveRoomDisplayName(req.getRoomId(), opt));
            out.add(row);
        }
        return out;
    }

    /** 指定审核人或规则推荐审核人均可处理待审单 */
    public boolean canUserReviewDelayRequest(String reviewerUserId, TwinScanDelayRequest req) {
        if (!StringUtils.hasText(reviewerUserId) || req == null) return false;
        String canonical = resolveCanonicalUserId(reviewerUserId);
        return canUserSeePendingDelayRequest(canonical, req);
    }

    public List<Map<String, Object>> listPendingEnriched(String reviewerUserId) {
        if (!StringUtils.hasText(reviewerUserId)) return List.of();
        String reviewer = reviewerUserId.trim();
        List<TwinScanDelayRequest> pending = listMyPendingReviews(reviewer);
        if (pending.isEmpty()) return List.of();

        Map<String, Integer> approvedCounts = loadApprovedCountMap(reviewer);
        Set<String> subjectIds = pending.stream()
                .map(TwinScanDelayRequest::getSubjectUserId)
                .filter(StringUtils::hasText)
                .map(String::trim)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        Map<String, String> displayNames = userDisplayNameService.resolveDisplayNames(subjectIds);
        Map<String, String> groupNames = new HashMap<>();

        List<Map<String, Object>> out = new ArrayList<>();
        for (TwinScanDelayRequest req : pending) {
            TwinScanDelayOption opt = configService.requireOptionQuiet(req.getOptionId());
            String subjectId = req.getSubjectUserId() != null ? req.getSubjectUserId().trim() : "";
            String countKey = approvedCountKey(subjectId, req.getOptionId());
            int approvedCount = approvedCounts.getOrDefault(countKey, 0);
            Map<String, Object> row = new HashMap<>();
            row.put("id", req.getId());
            row.put("subjectUserId", subjectId);
            row.put("subjectDisplayName", displayNames.getOrDefault(subjectId, subjectId));
            row.put("subjectGroupName", groupNames.computeIfAbsent(subjectId, this::resolveSubjectGroup));
            row.put("approvedCount", approvedCount);
            row.put("referenceSeq", approvedCount + 1);
            row.put("roomId", req.getRoomId());
            row.put("optionId", req.getOptionId());
            row.put("status", req.getStatus());
            row.put("createdAt", formatWallClock(req.getCreatedAt()));
            row.put("optionLabel", opt != null ? opt.getOptionLabel() : "");
            row.put("roomName", resolveRoomDisplayName(req.getRoomId(), opt));
            row.put("requireApproval", opt != null && opt.getRequireApproval() != null && opt.getRequireApproval() == 1);
            out.add(row);
        }
        return out;
    }

    private Map<String, Integer> loadApprovedCountMap(String reviewerUserId) {
        Map<String, Integer> map = new HashMap<>();
        for (Map<String, Object> row : requestMapper.listApprovedCountsByReviewer(reviewerUserId)) {
            String subjectId = str(row.get("subjectUserId"));
            long optionId = longVal(row.get("optionId"));
            int count = intVal(row.get("approvedCount"), 0);
            if (StringUtils.hasText(subjectId) && optionId > 0) {
                map.put(approvedCountKey(subjectId, optionId), count);
            }
        }
        return map;
    }

    private String resolveSubjectGroup(String userId) {
        if (!StringUtils.hasText(userId)) return "未标注课题组";
        try {
            AroPersonnel personnel = aroPersonnelMapper.findByUserId(userId.trim());
            if (personnel == null) return "未标注课题组";
            String resolved = personnel.getResolvedProjectGroupNames();
            if (!StringUtils.hasText(resolved)) return "未标注课题组";
            List<String> groups = PersonnelProjectGroupUtil.splitGroups(resolved);
            if (!groups.isEmpty()) return groups.get(0);
            return resolved.trim();
        } catch (Exception e) {
            log.warn("[scan-delay] resolve group failed userId={}: {}", userId, e.getMessage());
            return "未标注课题组";
        }
    }

    private static String approvedCountKey(String subjectUserId, Long optionId) {
        return subjectUserId.trim() + ":" + (optionId != null ? optionId : 0L);
    }

    /** API 返回北京时间墙钟字符串（与 Jackson LocalDateTime 序列化一致） */
    private static String formatWallClock(LocalDateTime dt) {
        return BusinessTimeWindow.toDisplayWallClock(dt);
    }

    /** twin_scan_delay_request.room_id 存 ARO officialRoomId，优先字典展示名 */
    private String resolveRoomDisplayName(String roomId, TwinScanDelayOption opt) {
        if (StringUtils.hasText(roomId)) {
            String rid = roomId.trim();
            try {
                RoomDictionaryManager.RoomMapping mapped = roomDictionaryManager.translate(rid);
                if (mapped != null && StringUtils.hasText(mapped.displayName)) {
                    return mapped.displayName.trim();
                }
            } catch (Exception e) {
                log.debug("[scan-delay] dictionary lookup failed roomId={}: {}", roomId, e.getMessage());
            }
            try {
                RoomMappingRoom catalog = roomMappingRoomMapper.selectByRoomId(rid);
                if (catalog != null && StringUtils.hasText(catalog.getRoomName())) {
                    return catalog.getRoomName().trim();
                }
            } catch (Exception e) {
                log.debug("[scan-delay] room catalog lookup failed roomId={}: {}", roomId, e.getMessage());
            }
        }
        if (opt != null && StringUtils.hasText(opt.getRoomName())) {
            return opt.getRoomName().trim();
        }
        return StringUtils.hasText(roomId) ? roomId.trim() : "未知房间";
    }

    private static String str(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }

    private static long longVal(Object v) {
        if (v == null) return 0L;
        try {
            return Long.parseLong(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return 0L;
        }
    }

    private static int intVal(Object v, int def) {
        if (v == null) return def;
        try {
            return Integer.parseInt(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return def;
        }
    }

    private String resolveCanonicalUserId(String raw) {
        if (!StringUtils.hasText(raw)) return "";
        String trimmed = raw.trim();
        User byId = userMapper.findById(trimmed);
        if (byId != null && StringUtils.hasText(byId.getId())) {
            return byId.getId().trim();
        }
        User byName = userMapper.findByUsername(trimmed);
        if (byName != null && StringUtils.hasText(byName.getId())) {
            return byName.getId().trim();
        }
        return trimmed;
    }

    private Map<String, Object> grantExempt(String cardNo, TwinScanDelayOption opt, String roomId, String source) {
        String roomIdsJson = enrichExemptRoomIdsWithNames(configService.resolveExemptRoomIdsJson(opt, roomId));
        String mode = StringUtils.hasText(opt.getExemptMode()) ? opt.getExemptMode() : "TIME";
        Integer duration = opt.getDurationMinutes();
        String extendUntil = StringUtils.hasText(opt.getExtendUntilTime()) ? opt.getExtendUntilTime().trim() : null;
        Integer maxCount = opt.getMaxCount();
        Map<String, Object> updated = cardMappingService.updateExemptFlag(
                cardNo, 1, duration, mode, maxCount, roomIdsJson, extendUntil
        );
        log.info("[scan-delay] grant exempt cardNo={} roomId={} optionId={} source={}",
                cardNo, roomId, opt.getId(), source);
        Map<String, Object> out = new HashMap<>(updated);
        out.put("status", "GRANTED");
        out.put("message", "已授予系统特权免冻结");
        return out;
    }

    /**
     * 将豁免房间 ID JSON 从纯 ID 数组（如 ["roomId1"]）转换为含 roomName 的对象数组
     * （如 [{"roomId":"roomId1","roomName":"会议室A"}]），与 dahua-issue 手动豁免格式一致，
     * 确保前端 parseExemptRoomNames 能正确显示房间名称。
     */
    private String enrichExemptRoomIdsWithNames(String roomIdsJson) {
        if (!StringUtils.hasText(roomIdsJson)) {
            return roomIdsJson;
        }
        try {
            JSONArray arr = JSON.parseArray(roomIdsJson.trim());
            if (arr == null || arr.isEmpty()) {
                return roomIdsJson;
            }
            JSONArray out = new JSONArray();
            for (int i = 0; i < arr.size(); i++) {
                Object item = arr.get(i);
                String rid;
                if (item instanceof JSONObject) {
                    // 已是对象格式：补全 roomName（若缺失）
                    JSONObject obj = (JSONObject) item;
                    rid = obj.getString("roomId");
                    String existingName = obj.getString("roomName");
                    if (StringUtils.hasText(existingName)) {
                        out.add(obj);
                        continue;
                    }
                } else {
                    rid = String.valueOf(item).trim();
                }
                if (!StringUtils.hasText(rid)) {
                    continue;
                }
                String resolvedName = resolveRoomDisplayName(rid, null);
                JSONObject enriched = new JSONObject();
                enriched.put("roomId", rid.trim());
                enriched.put("roomName", StringUtils.hasText(resolvedName) ? resolvedName.trim() : rid.trim());
                out.add(enriched);
            }
            return out.toString();
        } catch (Exception e) {
            log.warn("[scan-delay] enrich exempt room ids failed, fallback to raw: {}", e.getMessage());
            return roomIdsJson;
        }
    }

    private boolean isConfiguredReviewerForOption(TwinScanDelayOption opt, String canonicalReviewerId) {
        if (!StringUtils.hasText(canonicalReviewerId)) return false;
        return resolveConfiguredCanonicalReviewerIds(opt).contains(canonicalReviewerId);
    }

    private List<String> resolveConfiguredCanonicalReviewerIds(TwinScanDelayOption opt) {
        List<String> out = new ArrayList<>();
        if (opt == null) return out;
        for (String raw : configService.resolveReviewerUserIds(opt)) {
            if (!StringUtils.hasText(raw)) continue;
            String canonical = resolveCanonicalUserId(raw.trim());
            if (!StringUtils.hasText(canonical)) continue;
            User u = userMapper.findById(canonical);
            if (u == null) {
                u = userMapper.findByUsername(raw.trim());
                if (u != null && StringUtils.hasText(u.getId())) {
                    canonical = u.getId().trim();
                }
            }
            if (StringUtils.hasText(canonical) && !out.contains(canonical)) {
                out.add(canonical);
            }
        }
        return out;
    }

    /** 审核结果通知主体用户（学生手机端通知页 + WebSocket） */
    private void notifySubjectOnReview(TwinScanDelayRequest req, TwinScanDelayOption opt,
                                       boolean approve, String rejectReason, String reviewerUserId) {
        if (req == null || !StringUtils.hasText(req.getSubjectUserId())) {
            return;
        }
        try {
            PublishNotificationEvent event = new PublishNotificationEvent();
            event.setEventType("COMPLETED");
            event.setBizType("SCAN_DELAY");
            event.setBizId(String.valueOf(req.getId()));
            event.setSenderId(reviewerUserId);
            event.setApplicantId(req.getSubjectUserId().trim());
            String optionLabel = opt != null && StringUtils.hasText(opt.getOptionLabel())
                    ? opt.getOptionLabel() : "延迟免冻结";
            String roomLabel = resolveRoomDisplayName(req.getRoomId(), opt);
            Map<String, String> vars = new HashMap<>();
            vars.put("requestId", String.valueOf(req.getId()));
            vars.put("bizId", String.valueOf(req.getId()));
            vars.put("roomName", roomLabel);
            vars.put("optionLabel", optionLabel);
            if (approve) {
                vars.put("summary", roomLabel + " · " + optionLabel);
            } else {
                String reason = StringUtils.hasText(rejectReason) ? rejectReason.trim() : "不予通过";
                vars.put("summary", roomLabel + " · " + reason);
            }
            event.setVariables(vars);
            notificationService.publish(event);
        } catch (Exception e) {
            log.warn("[scan-delay] notify subject failed: {}", e.getMessage());
        }
    }

    private void notifyConfiguredReviewers(TwinScanDelayRequest req, TwinScanDelayOption opt, List<String> reviewerIds) {
        if (reviewerIds == null || reviewerIds.isEmpty()) return;
        try {
            Set<String> related = new LinkedHashSet<>(reviewerIds);
            PublishNotificationEvent event = new PublishNotificationEvent();
            event.setEventType("CREATED");
            event.setBizType("SCAN_DELAY");
            event.setBizId(String.valueOf(req.getId()));
            event.setSenderId(req.getRequestedBy());
            event.setProcessorId(reviewerIds.get(0));
            event.setRelatedUserIds(related);
            Map<String, String> vars = new HashMap<>();
            vars.put("requestId", String.valueOf(req.getId()));
            vars.put("bizId", String.valueOf(req.getId()));
            vars.put("roomName", resolveRoomDisplayName(req.getRoomId(), opt));
            vars.put("optionLabel", opt.getOptionLabel());
            String subjectName = userDisplayNameService.resolveDisplayName(req.getSubjectUserId());
            String subjectGroup = resolveSubjectGroup(req.getSubjectUserId());
            int approvedBefore = loadApprovedCountMap(reviewerIds.get(0))
                    .getOrDefault(approvedCountKey(req.getSubjectUserId(), req.getOptionId()), 0);
            vars.put("subjectDisplayName", subjectName);
            vars.put("subjectGroupName", subjectGroup);
            vars.put("approvedCount", String.valueOf(approvedBefore));
            String roomLabel = resolveRoomDisplayName(req.getRoomId(), opt);
            vars.put("summary", subjectName + " · " + subjectGroup + " · 历史已通过 " + approvedBefore + " 次 · "
                    + roomLabel + " · " + opt.getOptionLabel());
            event.setVariables(vars);
            notificationService.publish(event);
        } catch (Exception e) {
            log.warn("[scan-delay] notify reviewers failed: {}", e.getMessage());
        }
    }
}
