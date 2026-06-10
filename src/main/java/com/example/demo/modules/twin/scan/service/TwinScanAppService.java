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
import com.example.demo.modules.twin.scan.support.ScanAnalyzeTimingTrace;
import com.example.demo.modules.twin.scan.support.ScanPopupEntryWindowEvaluator;
import com.example.demo.modules.twin.scan.support.ScanPopupFlowLog;
import com.example.demo.modules.twin.common.support.TwinTimingDiagnostics;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

@Service
public class TwinScanAppService {
    private static final Logger log = LoggerFactory.getLogger(TwinScanAppService.class);
    private static final Pattern CARD_INPUT_PATTERN = Pattern.compile("^[A-Za-z0-9]{4,32}$");

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
            // 风控豁免：非开放时段仍允许扫码进入（与联动豁免同源）
            if (!entryAllowedNow && twinCardMappingService.isLinkageRuleExempt(realPhysicalId)) {
                entryAllowedNow = true;
            }
            result.setScanPopupEntryAllowedNow(entryAllowedNow);
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
}
