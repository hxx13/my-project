package com.example.demo.modules.twin.service;

import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.twin.dto.ScanAnalyzeResponseDTO;
import com.example.demo.modules.twin.dto.scan.ScanUserInfoDTO;
import com.example.demo.modules.twin.dto.scan.ScanUserRpgDTO;
import com.example.demo.modules.twin.entity.TwinCardMapping;
import com.example.demo.modules.twin.mapper.TwinDashboardMapper;
import com.example.demo.modules.twin.support.ScanPopupEntryWindowEvaluator;
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

    @Value("${app.business-timezone:Asia/Shanghai}")
    private String businessTimeZone;

    public ScanAnalyzeResponseDTO analyzeScan(String rawInput, User operator, String operatorRoleHint) {
        ScanAnalyzeResponseDTO result = new ScanAnalyzeResponseDTO();
        String cleanInput = rawInput.trim();
        String traceId = "SCAN-" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("HHmmssSSS"));
        LocalDateTime startAt = LocalDateTime.now();
        boolean looksLikeCardToken = CARD_INPUT_PATTERN.matcher(cleanInput).matches();
        log.info("[scan-flow:{}] 1/5 💳 本次读入：{}{}",
                traceId,
                looksLikeCardToken ? "物理卡号=" + cleanInput : "检索键入",
                looksLikeCardToken ? "" : " 内容=" + cleanInput);

        try {
            String realPhysicalId = cleanInput;
            String mappedDahuaSeq = null;
            Map<String, Object> matchedUser = null;

            TwinCardMapping mapping = null;
            if (looksLikeCardToken) {
                mapping = twinCardMappingService.getByCardNo(cleanInput);
            }
            if (mapping != null) {
                realPhysicalId = mapping.getAroUserId();
                mappedDahuaSeq = mapping.getDahuaSeq();
            }

            List<Map<String, Object>> userList = dashboardMapper.searchPersonnel(realPhysicalId, 1);
            if (!userList.isEmpty()) {
                matchedUser = userList.get(0);
                if (matchedUser.get("user_id") != null && !matchedUser.get("user_id").toString().trim().isEmpty()) {
                    realPhysicalId = matchedUser.get("user_id").toString().trim();
                }

                if (mappedDahuaSeq == null) {
                    TwinCardMapping reverseMapping = twinCardMappingService.getByAroUserId(realPhysicalId);
                    if (reverseMapping != null && "NORMAL".equals(reverseMapping.getCardStatus())) {
                        mappedDahuaSeq = reverseMapping.getDahuaSeq();
                    }
                }
            } else {
                result.setSuccess(false);
                result.setMessage("未找到人员档案: " + cleanInput);
                return result;
            }

            TwinCardMapping mappingForUser = twinCardMappingService.getByAroUserId(realPhysicalId);
            String cardNoForLog = mapping != null ? cleanInput
                    : (mappingForUser != null ? mappingForUser.getCardNo() : null);
            if (cardNoForLog != null) {
                log.info("[scan-flow:{}] 2/5 🔗 绑定 ARO 人员 userId={} 物理卡号={}", traceId, realPhysicalId, cardNoForLog);
            } else {
                log.info("[scan-flow:{}] 2/5 🔗 绑定 ARO 人员 userId={}（无本地物理卡映射）", traceId, realPhysicalId);
            }

            result.setHasPhysicalCardMapping(mappingForUser != null);

            Map<String, Object> scanStatus = twinScanService.processScanStatus(realPhysicalId, traceId);
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
                Map<String, Object> riskData = aroService.getUserDetailAndDisciplinary(realPhysicalId);
                if (riskData != null) {
                    Object stateObj = riskData.get("state");
                    result.setGlobalUserState(stateObj instanceof Number ? ((Number) stateObj).intValue() : 2);
                    result.setDisciplinaryRecords((List<Map<String, Object>>) riskData.get("userDisciplinaryRecords"));
                } else {
                    result.setGlobalUserState(2);
                }
            } catch (Exception e) {
                log.warn("[scan-flow:{}] ⚠️ 风控查询失败，按默认可用处理 userId={} err={}", traceId, realPhysicalId, e.getMessage());
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
            com.example.demo.modules.aro.dto.RpgStatsDto rpgDto = rpgEngineService.calculateRealtimeExp(realPhysicalId, historicalExp);
            userInfo.setRpg(new ScanUserRpgDTO(
                    rpgDto.getExp().intValue(),
                    rpgDto.getLevel(),
                    rpgDto.getNextLevelExp().intValue()
            ));

            userInfo.setDahuaSeq(mappedDahuaSeq);
            result.setUserInfo(userInfo);
            Map<String, Object> swingCfg = dahuaSwingRuleConfigService.getConfig();
            ZoneId winZone;
            try {
                winZone = ZoneId.of(businessTimeZone != null ? businessTimeZone : "Asia/Shanghai");
            } catch (Exception e) {
                winZone = ZoneId.systemDefault();
            }
            result.setScanPopupEntryWindowEnabled(ScanPopupEntryWindowEvaluator.isWindowEnabled(swingCfg));
            result.setScanPopupEntryAllowedNow(ScanPopupEntryWindowEvaluator.isEntryAllowedNow(swingCfg, winZone));
            try {
                result.setStudentViolationNotice(twinStudentViolationService.buildNotice(realPhysicalId));
            } catch (Exception e) {
                log.warn("[scan-flow:{}] 违规通告加载失败 userId={} err={}", traceId, realPhysicalId, e.getMessage());
            }
            if (Boolean.FALSE.equals(result.getHasPhysicalCardMapping())) {
                try {
                    result.setUnboundCardNotice(
                            unboundNoticeConfigService.buildUnboundNotice(operator, operatorRoleHint)
                    );
                } catch (Exception e) {
                    log.warn("[scan-flow:{}] 未绑卡提示加载失败 userId={} err={}", traceId, realPhysicalId, e.getMessage());
                }
            }
            try {
                result.setScanPopupAnnouncements(
                        scanPopupAnnouncementService.buildBundleForScan(operator, operatorRoleHint)
                );
            } catch (Exception e) {
                log.warn("[scan-flow:{}] 扫码公告加载失败 userId={} err={}", traceId, realPhysicalId, e.getMessage());
            }
            result.setSuccess(true);
            long costPre = Duration.between(startAt, LocalDateTime.now()).toMillis();
            log.info(
                    "[scan-flow:{}] 5/5 🛡️ 概要 userId={} 场内/场外={} 待离房间数={} 可进房间数={} 风控状态码={} ⏱{}ms",
                    traceId,
                    realPhysicalId,
                    result.getCurrentState(),
                    result.getPendingRooms() == null ? 0 : result.getPendingRooms().size(),
                    result.getAllowedRooms() == null ? 0 : result.getAllowedRooms().size(),
                    result.getGlobalUserState(),
                    costPre
            );
        } catch (Exception e) {
            log.error("[scan-flow:{}] ❌ 解析失败 {}", traceId, e.getMessage(), e);
            result.setSuccess(false);
            result.setMessage("扫码解析失败: " + e.getMessage());
        } finally {
            long cost = Duration.between(startAt, LocalDateTime.now()).toMillis();
            if (!result.isSuccess()) {
                log.info("[scan-flow:{}] ⏱结束 耗时={}ms（未成功）", traceId, cost);
            }
        }
        return result;
    }
}
