package com.example.demo.modules.twin.scan.service;

import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.twin.scan.dto.ScanAnalyzeResponseDTO;
import com.example.demo.modules.twin.scan.dto.scan.ScanUserInfoDTO;
import com.example.demo.modules.twin.scan.dto.scan.ScanUserRpgDTO;
import com.example.demo.modules.twin.card.entity.TwinCardMapping;
import com.example.demo.modules.twin.card.service.TwinCardMappingService;
import com.example.demo.modules.twin.common.mapper.TwinDashboardMapper;
import com.example.demo.modules.twin.dahua.entity.DahuaActivationState;
import com.example.demo.modules.twin.dahua.mapper.DahuaSwingMapper;
import com.example.demo.modules.twin.dahua.service.DahuaSwingRuleConfigService;
import com.example.demo.modules.twin.dashboard.service.TwinScanPopupAnnouncementService;
import com.example.demo.modules.twin.dashboard.service.TwinStudentViolationNoticeConfigService;
import com.example.demo.modules.twin.dashboard.service.TwinStudentViolationService;
import com.example.demo.modules.twin.rpg.service.RpgEngineService;
import com.example.demo.modules.twin.scan.delay.dto.ScanDelayOptionDTO;
import com.example.demo.modules.twin.scan.delay.service.ScanDelayConfigService;
import com.example.demo.modules.twin.scan.dto.ExemptStatusDTO;
import com.example.demo.modules.twin.scan.delay.entity.TwinScanDelayRequest;
import com.example.demo.modules.twin.scan.delay.entity.TwinScanDelayOption;
import com.example.demo.modules.twin.scan.delay.mapper.TwinScanDelayRequestMapper;
import com.example.demo.modules.twin.scan.delay.mapper.TwinScanDelayOptionMapper;
import com.example.demo.modules.twin.scan.support.ScanAnalyzeTimingTrace;
import com.example.demo.modules.twin.scan.support.ScanPopupEntryWindowEvaluator;
import com.example.demo.modules.twin.scan.support.ScanPopupFlowLog;
import com.example.demo.modules.twin.common.support.TwinTimingDiagnostics;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

@Service
public class TwinScanAppService {
    private static final Logger log = LoggerFactory.getLogger(TwinScanAppService.class);
    private static final Pattern CARD_INPUT_PATTERN = Pattern.compile("^[A-Za-z0-9]{4,32}$");
    private static final ObjectMapper EXEMPT_ROOM_OBJECT_MAPPER = new ObjectMapper();

    @Autowired
    private TwinScanService twinScanService;

    @Autowired
    private TwinDashboardMapper dashboardMapper;

    @Autowired
    private RpgEngineService rpgEngineService;

    @Autowired
    private TwinCardMappingService twinCardMappingService;

    @Autowired
    private AroService aroService;

    @Autowired
    private DahuaSwingRuleConfigService dahuaSwingRuleConfigService;

    @Autowired
    private TwinStudentViolationService twinStudentViolationService;

    @Autowired
    private TwinStudentViolationNoticeConfigService unboundNoticeConfigService;

    @Autowired
    private TwinScanPopupAnnouncementService scanPopupAnnouncementService;

    @Autowired
    private ScanAnalyzeTimingTrace analyzeTimingTrace;

    @Autowired
    private DahuaSwingMapper dahuaSwingMapper;

    @Autowired
    private ScanDelayConfigService scanDelayConfigService;

    @Autowired
    private TwinScanNoticeAutoSuppressService scanNoticeAutoSuppressService;

    @Autowired
    private TwinScanDelayRequestMapper scanDelayRequestMapper;

    @Autowired
    private TwinScanDelayOptionMapper scanDelayOptionMapper;

    @Value("${app.business-timezone:Asia/Shanghai}")
    private String businessTimeZone;

    public ScanAnalyzeResponseDTO analyzeScan(String rawInput, User operator, String operatorRoleHint) {
        ScanAnalyzeResponseDTO result = new ScanAnalyzeResponseDTO();
        String cleanInput = rawInput.trim();
        String traceId = "SCAN-" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("HHmmssSSS"));
        LocalDateTime startAt = LocalDateTime.now();
        boolean looksLikeCardToken = CARD_INPUT_PATTERN.matcher(cleanInput).matches();
        String inputMode = ScanPopupFlowLog.inputMode(looksLikeCardToken);
        analyzeTimingTrace.open(traceId, cleanInput);

        try {
            String realPhysicalId = cleanInput;
            String mappedDahuaSeq = null;
            Map<String, Object> matchedUser = null;

            long tCard = System.currentTimeMillis();
            TwinCardMapping mapping = null;
            if (looksLikeCardToken) {
                mapping = twinCardMappingService.getByCardNo(cleanInput);
            }
            if (mapping != null) {
                realPhysicalId = mapping.getAroUserId();
                mappedDahuaSeq = mapping.getDahuaSeq();
            }
            long cardMs = System.currentTimeMillis() - tCard;
            TwinTimingDiagnostics.logScanPhase(traceId, "mysql.cardMapping", cardMs, mapping != null ? "hit" : "miss");
            analyzeTimingTrace.step("mysql.twin_card_mapping.getByCardNo", cardMs, mapping != null ? "hit" : "miss");

            long tPersonnel = System.currentTimeMillis();
            List<Map<String, Object>> userList = dashboardMapper.searchPersonnel(realPhysicalId, 1);
            long personnelMs = System.currentTimeMillis() - tPersonnel;
            TwinTimingDiagnostics.logScanPhase(traceId, "mysql.searchPersonnel", personnelMs, "rows=" + userList.size());
            analyzeTimingTrace.step("mysql.dashboard.searchPersonnel", personnelMs, "rows=" + userList.size());
            if (!userList.isEmpty()) {
                matchedUser = userList.get(0);
                if (matchedUser.get("user_id") != null && !matchedUser.get("user_id").toString().trim().isEmpty()) {
                    realPhysicalId = matchedUser.get("user_id").toString().trim();
                }

                if (mappedDahuaSeq == null) {
                    long tRev = System.currentTimeMillis();
                    TwinCardMapping reverseMapping = twinCardMappingService.getByAroUserId(realPhysicalId);
                    analyzeTimingTrace.step("mysql.twin_card_mapping.getByAroUserId(reverse)",
                            System.currentTimeMillis() - tRev,
                            reverseMapping != null ? "hit" : "miss");
                    if (reverseMapping != null && "NORMAL".equals(reverseMapping.getCardStatus())) {
                        mappedDahuaSeq = reverseMapping.getDahuaSeq();
                    }
                }
            } else {
                result.setSuccess(false);
                result.setMessage("未找到人员档案: " + cleanInput);
                return result;
            }

            long tMapUser = System.currentTimeMillis();
            TwinCardMapping mappingForUser = twinCardMappingService.getByAroUserId(realPhysicalId);
            analyzeTimingTrace.step("mysql.twin_card_mapping.getByAroUserId",
                    System.currentTimeMillis() - tMapUser,
                    mappingForUser != null ? "hit" : "miss");
            result.setHasPhysicalCardMapping(mappingForUser != null);

            long tScanStatus = System.currentTimeMillis();
            Map<String, Object> scanStatus = twinScanService.processScanStatus(realPhysicalId, traceId);
            long scanStatusMs = System.currentTimeMillis() - tScanStatus;
            TwinTimingDiagnostics.logScanPhase(traceId, "processScanStatus(total)", scanStatusMs,
                    "state=" + scanStatus.get("currentState"));
            analyzeTimingTrace.step("processScanStatus(total)", scanStatusMs,
                    "state=" + scanStatus.get("currentState"));
            result.setCurrentState(String.valueOf(scanStatus.get("currentState")));
            if (scanStatus.get("message") != null) {
                result.setMessage(String.valueOf(scanStatus.get("message")));
            }
            if (scanStatus.containsKey("pendingRooms")) {
                result.setPendingRooms((List<Map<String, Object>>) scanStatus.get("pendingRooms"));
            }
            if (scanStatus.containsKey("allowedRooms")) {
                result.setAllowedRooms((List<Map<String, Object>>) scanStatus.get("allowedRooms"));
            }

            try {
                long tAroDetail = System.currentTimeMillis();
                Map<String, Object> riskData = aroService.getUserDetailAndDisciplinary(realPhysicalId);
                long aroDetailMs = System.currentTimeMillis() - tAroDetail;
                TwinTimingDiagnostics.logScanPhase(traceId, "aro.userDetail", aroDetailMs, riskData != null ? "ok" : "null");
                analyzeTimingTrace.step(
                        "aro.GET https://aro.shsmu.edu.cn/jtu/api/admin/user/detail",
                        aroDetailMs,
                        riskData != null ? "ok" : "null");
                if (riskData != null) {
                    Object stateObj = riskData.get("state");
                    result.setGlobalUserState(stateObj instanceof Number ? ((Number) stateObj).intValue() : 2);
                    result.setDisciplinaryRecords((List<Map<String, Object>>) riskData.get("userDisciplinaryRecords"));
                } else {
                    result.setGlobalUserState(2);
                }
            } catch (Exception e) {
                log.debug("[扫码·解析] trace={} 风控查询失败 id={} err={}", traceId, realPhysicalId, e.getMessage());
                result.setGlobalUserState(2);
            }

            ScanUserInfoDTO userInfo = new ScanUserInfoDTO();
            userInfo.setUserId(realPhysicalId);
            userInfo.setName(matchedUser.get("name"));
            userInfo.setHead(matchedUser.get("head"));
            userInfo.setGroup(matchedUser.get("project_group_name"));
            userInfo.setGender(matchedUser.get("gender"));
            userInfo.setDepartmentName(matchedUser.get("department_name"));
            userInfo.setProjectGroupName(matchedUser.get("project_group_name"));
            userInfo.setMobilePhone(matchedUser.get("mobile_phone"));
            userInfo.setUserTypeNames(matchedUser.get("user_type_names"));

            double historicalExp = matchedUser.get("total_exp") != null
                    ? Double.parseDouble(matchedUser.get("total_exp").toString())
                    : 0.0;
            long tRpg = System.currentTimeMillis();
            com.example.demo.modules.aro.dto.RpgStatsDto rpgDto =
                    rpgEngineService.calculateRealtimeExp(realPhysicalId, historicalExp);
            analyzeTimingTrace.step("mysql.rpg.calculateRealtimeExp",
                    System.currentTimeMillis() - tRpg, "level=" + rpgDto.getLevel());
            userInfo.setRpg(new ScanUserRpgDTO(
                    rpgDto.getExp().intValue(),
                    rpgDto.getLevel(),
                    rpgDto.getNextLevelExp().intValue()
            ));

            userInfo.setDahuaSeq(mappedDahuaSeq);
            result.setUserInfo(userInfo);
            long tSwingCfg = System.currentTimeMillis();
            Map<String, Object> swingCfg = dahuaSwingRuleConfigService.getConfig();
            analyzeTimingTrace.step("mysql.twin_dahua_rule_config.getConfig",
                    System.currentTimeMillis() - tSwingCfg, "");
            ZoneId winZone;
            try {
                winZone = ZoneId.of(businessTimeZone != null ? businessTimeZone : "Asia/Shanghai");
            } catch (Exception e) {
                winZone = ZoneId.systemDefault();
            }
            result.setScanPopupEntryWindowEnabled(ScanPopupEntryWindowEvaluator.isWindowEnabled(swingCfg));
            boolean entryAllowedNow = ScanPopupEntryWindowEvaluator.isEntryAllowedNow(swingCfg, winZone);
            // 全局时段仍返回 scanPopupEntryAllowedNow；非开放时段下按房间标注 scanEntryTimeExempt（与 execute 一致）
            result.setScanPopupEntryAllowedNow(entryAllowedNow);
            java.util.List<String> exemptRoomIds =
                    twinCardMappingService.listScanEntryExemptRoomIds(realPhysicalId);
            if (!exemptRoomIds.isEmpty()) {
                result.setScanPopupExemptRoomIds(exemptRoomIds);
            }
            if (!entryAllowedNow) {
                annotateScanEntryTimeExempt(realPhysicalId, result.getPendingRooms(), exemptRoomIds);
                annotateScanEntryTimeExempt(realPhysicalId, result.getAllowedRooms(), exemptRoomIds);
            }
            try {
                long tViol = System.currentTimeMillis();
                result.setStudentViolationNotice(twinStudentViolationService.buildNotice(realPhysicalId));
                analyzeTimingTrace.step("mysql.twin_student_violation.buildNotice",
                        System.currentTimeMillis() - tViol, "");
            } catch (Exception e) {
                log.debug("[扫码·解析] trace={} 违规通告加载失败 id={} err={}", traceId, realPhysicalId, e.getMessage());
            }
            if (Boolean.FALSE.equals(result.getHasPhysicalCardMapping())) {
                try {
                    long tUnbound = System.currentTimeMillis();
                    result.setUnboundCardNotice(
                            unboundNoticeConfigService.buildUnboundNotice(operator, operatorRoleHint)
                    );
                    analyzeTimingTrace.step("mysql.unbound_notice.build",
                            System.currentTimeMillis() - tUnbound, "");
                } catch (Exception e) {
                    log.debug("[扫码·解析] trace={} 未绑卡提示加载失败 id={} err={}", traceId, realPhysicalId, e.getMessage());
                }
            }
            try {
                long tAnn = System.currentTimeMillis();
                result.setScanPopupAnnouncements(
                        scanPopupAnnouncementService.buildBundleForScan(operator, operatorRoleHint)
                );
                analyzeTimingTrace.step("mysql.scan_popup_announcement.buildBundle",
                        System.currentTimeMillis() - tAnn, "");
            } catch (Exception e) {
                log.debug("[扫码·解析] trace={} 公告加载失败 id={} err={}", traceId, realPhysicalId, e.getMessage());
            }
            try {
                scanNoticeAutoSuppressService.applyAutoOpenSuppressFlags(realPhysicalId, result);
            } catch (Exception e) {
                log.debug("[扫码·解析] trace={} 通告免弹标记失败 id={} err={}", traceId, realPhysicalId, e.getMessage());
            }
            // 自动签退倒计时：仅 INSIDE 状态有意义（OUTSIDE 无计时器）
            if ("INSIDE".equals(result.getCurrentState()) && realPhysicalId != null && !realPhysicalId.isBlank()) {
                try {
                    List<DahuaActivationState> states =
                            dahuaSwingMapper.listActivationStatesByUserId(realPhysicalId);
                    if (states != null && !states.isEmpty()) {
                        LocalDateTime now = LocalDateTime.now();
                        DateTimeFormatter dtf =
                                DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
                        // 取最早未到期的 scheduled_exit_at
                        for (DahuaActivationState st : states) {
                            String schedStr = st.getScheduledExitAt();
                            if (schedStr == null || schedStr.isBlank()) continue;
                            try {
                                LocalDateTime scheduled = LocalDateTime.parse(schedStr, dtf);
                                long remaining = Duration.between(now, scheduled).getSeconds();
                                if (remaining > 0) {
                                    result.setAutoSignoutState(st.getState());
                                    result.setAutoSignoutScheduledAt(schedStr);
                                    result.setAutoSignoutSecondsRemaining((int) remaining);
                                    break;
                                }
                            } catch (Exception ignore) {
                                // 日期解析失败则跳过该行
                            }
                        }
                    }
                } catch (Exception e) {
                    log.debug("[扫码·解析] trace={} 自动签退计时器查询失败 id={} err={}",
                            traceId, realPhysicalId, e.getMessage());
                }
            }
            annotateScanDelayOptions(result);
            // H5 首页豁免状态
            result.setExemptStatus(buildExemptStatus(realPhysicalId));
            result.setSuccess(true);
        } catch (Exception e) {
            log.error("[扫码·解析] trace={} 异常 {}", traceId, e.getMessage(), e);
            result.setSuccess(false);
            result.setMessage("扫码解析失败: " + e.getMessage());
        } finally {
            long cost = Duration.between(startAt, LocalDateTime.now()).toMillis();
            analyzeTimingTrace.close(cost);
            String userName = result.getUserInfo() != null && result.getUserInfo().getName() != null
                    ? String.valueOf(result.getUserInfo().getName())
                    : "";
            ScanPopupFlowLog.logAnalyze(
                    traceId,
                    result.isSuccess(),
                    cost,
                    inputMode,
                    result.getUserInfo() != null ? result.getUserInfo().getUserId() : cleanInput,
                    userName,
                    Boolean.TRUE.equals(result.getHasPhysicalCardMapping()),
                    result.getCurrentState(),
                    result.getPendingRooms(),
                    result.getAllowedRooms(),
                    result.getScanPopupEntryWindowEnabled(),
                    result.getScanPopupEntryAllowedNow(),
                    result.getGlobalUserState(),
                    result.getMessage());
        }
        return result;
    }

    /** 非开放时段：为已配置免冻结授权的房间打上 scanEntryTimeExempt，供扫码弹窗按房间解锁「进入」。 */
    private void annotateScanEntryTimeExempt(
            String userId,
            List<Map<String, Object>> rooms,
            java.util.List<String> exemptRoomIds) {
        if (userId == null || userId.isBlank() || rooms == null || rooms.isEmpty()) {
            return;
        }
        java.util.Set<String> exemptSet = exemptRoomIds == null || exemptRoomIds.isEmpty()
                ? java.util.Collections.emptySet()
                : new java.util.LinkedHashSet<>(exemptRoomIds);
        for (Map<String, Object> room : rooms) {
            if (room == null) {
                continue;
            }
            String roomId = resolveScanRoomId(room);
            if (roomId != null
                    && (exemptSet.contains(roomId)
                    || twinCardMappingService.isRoomExemptForScanEntry(userId, roomId))) {
                room.put("scanEntryTimeExempt", true);
            }
        }
    }

    private static String resolveScanRoomId(Map<String, Object> room) {
        Object official = room.get("officialRoomId");
        if (official != null && !String.valueOf(official).isBlank()) {
            return String.valueOf(official).trim();
        }
        if (room.get("id") != null && !String.valueOf(room.get("id")).isBlank()) {
            return String.valueOf(room.get("id")).trim();
        }
        return null;
    }

    private void annotateScanDelayOptions(ScanAnalyzeResponseDTO result) {
        boolean enabled = scanDelayConfigService.isMasterEnabled();
        result.setScanDelayEnabled(enabled);
        if (!enabled) {
            result.setScanDelayOptionsByRoom(java.util.Collections.emptyMap());
            return;
        }
        result.setScanDelayButtonLabel(scanDelayConfigService.getButtonLabel());
        java.util.List<String> roomIds = new java.util.ArrayList<>();
        collectScanRoomIds(result.getPendingRooms(), roomIds);
        collectScanRoomIds(result.getAllowedRooms(), roomIds);
        if (roomIds.isEmpty()) {
            result.setScanDelayOptionsByRoom(java.util.Collections.emptyMap());
            return;
        }
        Map<String, java.util.List<ScanDelayOptionDTO>> grouped =
                scanDelayConfigService.listVisibleOptionsByRoomIds(roomIds);
        Map<String, java.util.List<Map<String, Object>>> out = new java.util.LinkedHashMap<>();
        for (Map.Entry<String, java.util.List<ScanDelayOptionDTO>> e : grouped.entrySet()) {
            java.util.List<Map<String, Object>> items = new java.util.ArrayList<>();
            for (ScanDelayOptionDTO dto : e.getValue()) {
                Map<String, Object> m = new java.util.LinkedHashMap<>();
                m.put("id", dto.getId());
                m.put("carrierId", dto.getCarrierId());
                m.put("roomId", dto.getRoomId());
                m.put("optionLabel", dto.getOptionLabel());
                m.put("buttonLabel", StringUtils.hasText(dto.getButtonLabel()) ? dto.getButtonLabel().trim() : scanDelayConfigService.getButtonLabel());
                m.put("requireApproval", dto.isRequireApproval());
                m.put("reviewerUserIds", dto.getReviewerUserIds());
                m.put("exemptMode", dto.getExemptMode());
                m.put("durationMinutes", dto.getDurationMinutes());
                m.put("extendUntilTime", dto.getExtendUntilTime());
                m.put("maxCount", dto.getMaxCount());
                items.add(m);
            }
            out.put(e.getKey(), items);
        }
        result.setScanDelayOptionsByRoom(out);
    }

    private void collectScanRoomIds(List<Map<String, Object>> rooms, java.util.List<String> sink) {
        if (rooms == null) return;
        for (Map<String, Object> room : rooms) {
            String id = resolveScanRoomId(room);
            if (id != null && !sink.contains(id)) sink.add(id);
        }
    }

    /** Public entry point for JWT-mode H5 exempt status query. */
    public ExemptStatusDTO buildExemptStatusForUser(String userId) {
        return buildExemptStatus(userId);
    }

    /**
     * 构建 H5 首页豁免状态。综合 twin_card_mapping + 当日延迟申请记录推导 phase。
     */
    private ExemptStatusDTO buildExemptStatus(String userId) {
        if (userId == null || userId.isBlank()) return null;

        ExemptStatusDTO dto = new ExemptStatusDTO();
        dto.setPhase("none");
        dto.setUsedCount(0);

        try {
            ZoneId zone;
            try {
                zone = ZoneId.of(businessTimeZone != null ? businessTimeZone : "Asia/Shanghai");
            } catch (Exception e) {
                zone = ZoneId.systemDefault();
            }

            // 1. 查询用户卡片映射（含豁免字段）
            TwinCardMapping mapping = twinCardMappingService.getByAroUserId(userId);
            boolean hasActiveExempt = mapping != null
                    && mapping.getFreezeExemptFlag() != null
                    && mapping.getFreezeExemptFlag() == 1;

            // 2. 查询当日延迟申请记录（取最新一条）
            List<TwinScanDelayRequest> recentRequests =
                    scanDelayRequestMapper.listRecentBySubjectUserId(userId, 5);

            TwinScanDelayRequest latestTodayRequest = null;
            if (recentRequests != null && !recentRequests.isEmpty()) {
                LocalDate today = ZonedDateTime.now(zone).toLocalDate();
                for (TwinScanDelayRequest req : recentRequests) {
                    if (req.getCreatedAt() != null && req.getCreatedAt().toLocalDate().equals(today)) {
                        latestTodayRequest = req;
                        break;
                    }
                }
            }

            // 3. Determine delay option room names + extendUntilTime
            List<String> requestRoomNames = List.of();
            String extendUntilTime = null;
            if (latestTodayRequest != null && latestTodayRequest.getOptionId() != null) {
                try {
                    TwinScanDelayOption option =
                            scanDelayOptionMapper.findById(latestTodayRequest.getOptionId());
                    if (option != null) {
                        extendUntilTime = option.getExtendUntilTime();
                        if (option.getExemptRoomIds() != null && !option.getExemptRoomIds().isBlank()) {
                            requestRoomNames = parseExemptRoomNames(option.getExemptRoomIds());
                        }
                    }
                } catch (Exception ignored) {
                    // delay option lookup failed, continue without it
                }
            }

            // 4. Derive phase
            if (latestTodayRequest != null) {
                String status = latestTodayRequest.getStatus();
                if ("PENDING".equalsIgnoreCase(status)) {
                    dto.setPhase("pending_review");
                    dto.setRequestId(latestTodayRequest.getId());
                    dto.setExtendUntilTime(extendUntilTime);
                    dto.setRoomNames(requestRoomNames);
                    dto.setRemainingText("");
                    return dto;
                } else if ("REJECTED".equalsIgnoreCase(status)) {
                    dto.setPhase("rejected");
                    dto.setRequestId(latestTodayRequest.getId());
                    dto.setRoomNames(requestRoomNames);
                    dto.setRemainingText("");
                    return dto;
                }
                // APPROVED: fall through to check exemption status
            }

            if (hasActiveExempt && mapping != null) {
                String expireAt = mapping.getFreezeExemptExpireAt();
                if (expireAt != null && !expireAt.isBlank()) {
                    try {
                        LocalDateTime expireTime = LocalDateTime.parse(
                                expireAt.replace(" ", "T"),
                                DateTimeFormatter.ofPattern("yyyy-MM-dd['T']HH:mm:ss"));
                        if (expireTime.isAfter(ZonedDateTime.now(zone).toLocalDateTime())) {
                            dto.setPhase("approved_active");
                        } else {
                            dto.setPhase("approved_expired");
                        }
                    } catch (Exception e) {
                        dto.setPhase("approved_expired");
                    }
                } else {
                    dto.setPhase("approved_active");
                }
                dto.setExpireAt(expireAt);
                dto.setMode(mapping.getFreezeExemptMode());
                dto.setMaxCount(mapping.getFreezeExemptMaxCount());
                dto.setUsedCount(mapping.getFreezeExemptUsedCount() != null ? mapping.getFreezeExemptUsedCount() : 0);
                dto.setRoomNames(parseExemptRoomNames(mapping.getFreezeExemptRoomIds()));
                dto.setRemainingText("");
            }

            return dto;
        } catch (Exception e) {
            log.warn("[扫码·豁免] buildExemptStatus failed for userId={}: {}", userId, e.getMessage());
            dto.setPhase("none");
            return dto;
        }
    }

    /** Parse freezeExemptRoomIds JSON -> room name list. Supports old ["id"] and new [{"roomId":"x","roomName":"y"}] formats. */
    private List<String> parseExemptRoomNames(String roomIdsJson) {
        if (roomIdsJson == null || roomIdsJson.isBlank()) return List.of();
        try {
            List<?> arr = EXEMPT_ROOM_OBJECT_MAPPER.readValue(roomIdsJson, List.class);
            if (arr == null || arr.isEmpty()) return List.of();
            List<String> names = new ArrayList<>();
            for (Object item : arr) {
                if (item instanceof Map) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> map = (Map<String, Object>) item;
                    Object name = map.get("roomName");
                    if (name != null && !String.valueOf(name).isBlank()) {
                        names.add(String.valueOf(name).trim());
                    } else {
                        Object id = map.get("roomId");
                        if (id != null && !String.valueOf(id).isBlank()) names.add(String.valueOf(id));
                    }
                } else if (item instanceof String) {
                    names.add((String) item);
                }
            }
            return names;
        } catch (Exception e) {
            log.debug("parseExemptRoomNames failed: {}", e.getMessage());
            return List.of();
        }
    }
}
