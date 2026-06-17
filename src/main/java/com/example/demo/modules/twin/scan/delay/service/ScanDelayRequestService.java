package com.example.demo.modules.twin.scan.delay.service;

import com.example.demo.modules.notification.dto.PublishNotificationEvent;
import com.example.demo.modules.notification.service.NotificationService;
import com.example.demo.modules.twin.card.entity.TwinCardMapping;
import com.example.demo.modules.twin.card.service.TwinCardMappingService;
import com.example.demo.modules.twin.scan.delay.entity.TwinScanDelayOption;
import com.example.demo.modules.twin.scan.delay.entity.TwinScanDelayRequest;
import com.example.demo.modules.twin.scan.delay.mapper.TwinScanDelayRequestMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

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
            List<String> configuredReviewers = configService.resolveReviewerUserIds(opt);
            if (configuredReviewers.isEmpty()) {
                throw new IllegalArgumentException("该延迟规则未配置审核教职工");
            }
            String reviewer = StringUtils.hasText(reviewerUserId) ? reviewerUserId.trim() : configuredReviewers.get(0);
            if (!configuredReviewers.contains(reviewer)) {
                throw new IllegalArgumentException("审核教职工不在该规则配置范围内");
            }
            TwinScanDelayRequest req = new TwinScanDelayRequest();
            req.setSubjectUserId(subjectUserId.trim());
            req.setCardNo(cardNo);
            req.setRoomId(roomId.trim());
            req.setOptionId(optionId);
            req.setDurationMinutes(opt.getDurationMinutes());
            req.setReviewerUserId(reviewer);
            req.setStatus("PENDING");
            req.setRequestedBy(operatorUserId);
            requestMapper.insert(req);
            notifyReviewer(req, opt);
            Map<String, Object> out = new HashMap<>();
            out.put("status", "PENDING");
            out.put("requestId", req.getId());
            out.put("message", "已提交审核，等待教职工确认");
            return out;
        }
        return grantExempt(cardNo, opt, roomId.trim(), "DIRECT");
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
        if (!reviewerUserId.trim().equals(req.getReviewerUserId())) {
            throw new IllegalArgumentException("无权审核该申请");
        }
        if (!approve) {
            requestMapper.updateStatus(requestId, "REJECTED", reviewerUserId.trim(), rejectReason);
            Map<String, Object> out = new HashMap<>();
            out.put("status", "REJECTED");
            out.put("requestId", requestId);
            return out;
        }
        TwinScanDelayOption opt = configService.requireOption(req.getOptionId());
        if (!configService.isOptionBoundToRoom(req.getRoomId(), req.getOptionId())) {
            throw new IllegalArgumentException("该房间未配置此延迟选项");
        }
        Map<String, Object> granted = grantExempt(req.getCardNo(), opt, req.getRoomId(), "APPROVED");
        requestMapper.updateStatus(requestId, "APPROVED", reviewerUserId.trim(), null);
        granted.put("requestId", requestId);
        granted.put("status", "APPROVED");
        return granted;
    }

    public List<TwinScanDelayRequest> listMyPendingReviews(String reviewerUserId) {
        if (!StringUtils.hasText(reviewerUserId)) return List.of();
        return requestMapper.listPendingByReviewer(reviewerUserId.trim(), 50);
    }

    public List<Map<String, Object>> listPendingEnriched(String reviewerUserId) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (TwinScanDelayRequest req : listMyPendingReviews(reviewerUserId)) {
            TwinScanDelayOption opt = configService.requireOptionQuiet(req.getOptionId());
            Map<String, Object> row = new HashMap<>();
            row.put("id", req.getId());
            row.put("subjectUserId", req.getSubjectUserId());
            row.put("roomId", req.getRoomId());
            row.put("optionId", req.getOptionId());
            row.put("status", req.getStatus());
            row.put("createdAt", req.getCreatedAt());
            row.put("optionLabel", opt != null ? opt.getOptionLabel() : "");
            row.put("roomName", opt != null ? opt.getRoomName() : req.getRoomId());
            row.put("requireApproval", opt != null && opt.getRequireApproval() != null && opt.getRequireApproval() == 1);
            out.add(row);
        }
        return out;
    }

    private Map<String, Object> grantExempt(String cardNo, TwinScanDelayOption opt, String roomId, String source) {
        String roomIdsJson = configService.resolveExemptRoomIdsJson(opt, roomId);
        String mode = StringUtils.hasText(opt.getExemptMode()) ? opt.getExemptMode() : "TIME";
        Integer duration = opt.getDurationMinutes();
        Integer maxCount = opt.getMaxCount();
        Map<String, Object> updated = cardMappingService.updateExemptFlag(
                cardNo, 1, duration, mode, maxCount, roomIdsJson
        );
        log.info("[scan-delay] grant exempt cardNo={} roomId={} optionId={} source={}",
                cardNo, roomId, opt.getId(), source);
        Map<String, Object> out = new HashMap<>(updated);
        out.put("status", "GRANTED");
        out.put("message", "已授予系统特权免冻结");
        return out;
    }

    private void notifyReviewer(TwinScanDelayRequest req, TwinScanDelayOption opt) {
        try {
            PublishNotificationEvent event = new PublishNotificationEvent();
            event.setEventType("CREATED");
            event.setBizType("SCAN_DELAY");
            event.setBizId(String.valueOf(req.getId()));
            event.setSenderId(req.getRequestedBy());
            event.setApplicantId(req.getSubjectUserId());
            event.setProcessorId(req.getReviewerUserId());
            Set<String> related = new HashSet<>();
            related.add(req.getReviewerUserId());
            event.setRelatedUserIds(related);
            Map<String, String> vars = new HashMap<>();
            vars.put("requestId", String.valueOf(req.getId()));
            vars.put("bizId", String.valueOf(req.getId()));
            vars.put("roomName", StringUtils.hasText(opt.getRoomName()) ? opt.getRoomName() : req.getRoomId());
            vars.put("optionLabel", opt.getOptionLabel());
            vars.put("summary", (StringUtils.hasText(opt.getRoomName()) ? opt.getRoomName() : req.getRoomId()) + " · " + opt.getOptionLabel());
            event.setVariables(vars);
            notificationService.publish(event);
        } catch (Exception e) {
            log.warn("[scan-delay] notify reviewer failed: {}", e.getMessage());
        }
    }
}
