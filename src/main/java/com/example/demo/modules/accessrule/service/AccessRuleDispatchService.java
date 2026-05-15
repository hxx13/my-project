package com.example.demo.modules.accessrule.service;

import com.alibaba.fastjson2.JSON;
import com.example.demo.modules.accessrule.entity.AccessRuleItem;
import com.example.demo.modules.dahua.service.DahuaOpenApiService;
import com.example.demo.modules.twin.entity.TwinCardMapping;
import com.example.demo.modules.twin.service.TwinAccessRuleScanConfigService;
import com.example.demo.modules.twin.service.TwinCardMappingService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 扫码进/离后：按门禁规则匹配并调用大华批量授权或回收（personCode 取自 twin_card_mapping.dahuaSeq）。
 * <p>全局开关仅短路大华 HTTP 调用本身；调用方若有 ARO、待激活计时、本地卡状态等逻辑须自行与开关解耦。</p>
 */
@Service
public class AccessRuleDispatchService {

    private static final Logger log = LoggerFactory.getLogger(AccessRuleDispatchService.class);
    private static final int BATCH_AUTH_RETRY_TIMES = 8;
    private static final long BATCH_AUTH_RETRY_BASE_MS = 500L;

    private final AccessRuleService accessRuleService;
    private final TwinCardMappingService twinCardMappingService;
    private final DahuaOpenApiService dahuaOpenApiService;
    private final TwinAccessRuleScanConfigService twinAccessRuleScanConfigService;

    public AccessRuleDispatchService(AccessRuleService accessRuleService,
                                     TwinCardMappingService twinCardMappingService,
                                     DahuaOpenApiService dahuaOpenApiService,
                                     TwinAccessRuleScanConfigService twinAccessRuleScanConfigService) {
        this.accessRuleService = accessRuleService;
        this.twinCardMappingService = twinCardMappingService;
        this.dahuaOpenApiService = dahuaOpenApiService;
        this.twinAccessRuleScanConfigService = twinAccessRuleScanConfigService;
    }

    /**
     * @return 派发结果；未命中规则返回 {@link AccessRuleDispatchResult#NO_RULE}
     */
    public AccessRuleDispatchResult tryApplyAccessForScanEnter(String roomId, String aroUserId) {
        if (!StringUtils.hasText(roomId) || !StringUtils.hasText(aroUserId)) {
            return AccessRuleDispatchResult.NO_RULE;
        }
        if (!twinAccessRuleScanConfigService.isEnterDispatchEnabled()) {
            log.info("[access-rule] 全局已关闭进入时门禁联动，跳过下发 roomId={} aroUserId={}", roomId, aroUserId);
            return AccessRuleDispatchResult.SCAN_LINKAGE_ENTER_DISABLED;
        }
        AccessRuleItem item = accessRuleService.findMatchingItem(roomId.trim(), aroUserId.trim());
        if (item == null) {
            log.debug("[access-rule] no rule match roomId={} aroUserId={}", roomId, aroUserId);
            return AccessRuleDispatchResult.NO_RULE;
        }
        List<Map<String, Object>> privilegeDetails = buildPrivilegeDetails(item);
        if (privilegeDetails.isEmpty()) {
            log.info("[access-rule] 规则无通道/门组，跳过下发 userId={}", aroUserId);
            return AccessRuleDispatchResult.MATCHED_NO_PRIVILEGE;
        }
        TwinCardMapping mapping = twinCardMappingService.getByAroUserId(aroUserId.trim());
        if (mapping == null) {
            log.warn("[access-rule] 跳过下发：无孪生卡映射 userId={}", aroUserId);
            return AccessRuleDispatchResult.NO_MAPPING;
        }
        String personCode = resolvePersonCode(mapping);
        if (personCode == null) {
            log.warn("[access-rule] 跳过下发：缺少大华人员编码 userId={}", aroUserId);
            return AccessRuleDispatchResult.NO_PERSON_CODE;
        }
        Map<String, Object> body = new HashMap<>();
        body.put("personCodes", Collections.singletonList(personCode));
        body.put("timeQuantumId", 1);
        body.put("privilegeDetails", privilegeDetails);
        log.info("[access-rule] 授权下发 userId={} 门禁资源数={}", aroUserId, privilegeDetails.size());
        Map<String, Object> resp = null;
        for (int attempt = 1; attempt <= BATCH_AUTH_RETRY_TIMES; attempt++) {
            try {
                resp = dahuaOpenApiService.postRaw(
                        "/evo-apigw/evo-accesscontrol/1.0.0/card/accessControl/personAuthority/batchAuthority",
                        body
                );
                if (dahuaOpenApiService.isSuccess(resp)) {
                    log.info("[access-rule] 授权下发成功 userId={} 第{}/{}次", aroUserId, attempt, BATCH_AUTH_RETRY_TIMES);
                    return AccessRuleDispatchResult.BATCH_OK;
                }
                if (!isRetryableBatchFailure(resp) || attempt == BATCH_AUTH_RETRY_TIMES) {
                    break;
                }
                log.warn("[access-rule] 授权重试 userId={} 第{}/{}次 {} code={}",
                        aroUserId, attempt, BATCH_AUTH_RETRY_TIMES,
                        shortErr(resp), shortCode(resp));
                sleepQuietly(BATCH_AUTH_RETRY_BASE_MS * attempt);
            } catch (Exception e) {
                log.error("[access-rule] 授权下发异常 userId={} err={}", aroUserId, e.getMessage());
                return AccessRuleDispatchResult.BATCH_FAILED;
            }
        }
        log.warn("[access-rule] 授权最终失败 userId={} {} code={}",
                aroUserId, shortErr(resp), shortCode(resp));
        return AccessRuleDispatchResult.BATCH_FAILED;
    }

    public AccessRuleDispatchResult tryRevokeAccessForScanExit(String roomId, String aroUserId) {
        if (!StringUtils.hasText(roomId) || !StringUtils.hasText(aroUserId)) {
            return AccessRuleDispatchResult.NO_RULE;
        }
        if (!twinAccessRuleScanConfigService.isExitDispatchEnabled()) {
            log.info("[access-rule] 全局已关闭离开时门禁联动，跳过回收 roomId={} aroUserId={}", roomId, aroUserId);
            return AccessRuleDispatchResult.SCAN_LINKAGE_EXIT_DISABLED;
        }
        AccessRuleItem item = accessRuleService.findMatchingItem(roomId.trim(), aroUserId.trim());
        if (item == null) {
            log.debug("[access-rule] revoke skip: no rule match roomId={} aroUserId={}", roomId, aroUserId);
            return AccessRuleDispatchResult.NO_RULE;
        }
        List<Map<String, Object>> deleteDetails = buildDeleteDetails(item);
        if (deleteDetails.isEmpty()) {
            log.info("[access-rule] 回收跳过：无通道/门组 userId={}", aroUserId);
            return AccessRuleDispatchResult.MATCHED_NO_PRIVILEGE;
        }
        TwinCardMapping mapping = twinCardMappingService.getByAroUserId(aroUserId.trim());
        if (mapping == null) {
            log.warn("[access-rule] 回收跳过：无孪生卡映射 userId={}", aroUserId);
            return AccessRuleDispatchResult.NO_MAPPING;
        }
        String personCode = resolvePersonCode(mapping);
        if (personCode == null) {
            log.warn("[access-rule] 回收跳过：缺少大华人员编码 userId={}", aroUserId);
            return AccessRuleDispatchResult.NO_PERSON_CODE;
        }
        Map<String, Object> body = new HashMap<>();
        body.put("personCode", personCode);
        body.put("deleteDetails", deleteDetails);
        log.info("[access-rule] 权限回收 userId={} 门禁资源数={}", aroUserId, deleteDetails.size());
        try {
            Map<String, Object> resp = dahuaOpenApiService.deleteSinglePrivilege(body);
            if (!dahuaOpenApiService.isSuccess(resp)) {
                log.warn("[access-rule] 权限回收失败 userId={} {} code={}",
                        aroUserId, shortErr(resp), shortCode(resp));
                return AccessRuleDispatchResult.DELETE_FAILED;
            }
            log.info("[access-rule] 权限回收成功 userId={}", aroUserId);
            return AccessRuleDispatchResult.DELETE_OK;
        } catch (Exception e) {
            log.error("[access-rule] 权限回收异常 userId={} err={}", aroUserId, e.getMessage());
            return AccessRuleDispatchResult.DELETE_FAILED;
        }
    }

    private String shortErr(Map<String, Object> resp) {
        if (resp == null) return "-";
        String msg = String.valueOf(resp.getOrDefault("errMsg", ""));
        if (!StringUtils.hasText(msg)) return "-";
        return msg.length() > 80 ? msg.substring(0, 80) + "..." : msg;
    }

    private String shortCode(Map<String, Object> resp) {
        if (resp == null) return "-";
        return String.valueOf(resp.getOrDefault("code", "-"));
    }

    private String resolvePersonCode(TwinCardMapping mapping) {
        if (!StringUtils.hasText(mapping.getDahuaPersonCode())) {
            return null;
        }
        return mapping.getDahuaPersonCode().trim();
    }

    private List<Map<String, Object>> buildPrivilegeDetails(AccessRuleItem item) {
        List<Map<String, Object>> details = new ArrayList<>();
        if (StringUtils.hasText(item.getChannelCodesJson())) {
            List<String> codes = JSON.parseArray(item.getChannelCodesJson(), String.class);
            if (codes != null) {
                for (String code : codes) {
                    if (!StringUtils.hasText(code)) continue;
                    details.add(Map.of(
                            "privilegeType", 1,
                            "timeQuantumId", 1,
                            "resourceCode", code.trim()
                    ));
                }
            }
        }
        if (StringUtils.hasText(item.getDoorGroupIdsJson())) {
            List<Long> groupIds = JSON.parseArray(item.getDoorGroupIdsJson(), Long.class);
            if (groupIds != null) {
                for (Long groupId : groupIds) {
                    if (groupId == null) continue;
                    details.add(Map.of(
                            "privilegeType", 2,
                            "timeQuantumId", 1,
                            "resourceCode", String.valueOf(groupId)
                    ));
                }
            }
        }
        return details;
    }

    private List<Map<String, Object>> buildDeleteDetails(AccessRuleItem item) {
        List<Map<String, Object>> details = new ArrayList<>();
        if (StringUtils.hasText(item.getChannelCodesJson())) {
            List<String> codes = JSON.parseArray(item.getChannelCodesJson(), String.class);
            if (codes != null) {
                for (String code : codes) {
                    if (!StringUtils.hasText(code)) continue;
                    details.add(Map.of(
                            "privilegeType", 1,
                            "resourceCode", code.trim()
                    ));
                }
            }
        }
        if (StringUtils.hasText(item.getDoorGroupIdsJson())) {
            List<Long> groupIds = JSON.parseArray(item.getDoorGroupIdsJson(), Long.class);
            if (groupIds != null) {
                for (Long groupId : groupIds) {
                    if (groupId == null) continue;
                    details.add(Map.of(
                            "privilegeType", 2,
                            "resourceCode", String.valueOf(groupId)
                    ));
                }
            }
        }
        return details;
    }

    private boolean isPersonSyncDelayError(Map<String, Object> resp) {
        if (resp == null) return false;
        String errMsg = String.valueOf(resp.getOrDefault("errMsg", ""));
        if (!StringUtils.hasText(errMsg)) {
            return false;
        }
        String norm = errMsg.toLowerCase();
        return norm.contains("person")
                && (norm.contains("not exist")
                || norm.contains("not found")
                || norm.contains("sync"))
                || errMsg.contains("人员")
                && (errMsg.contains("不存在")
                || errMsg.contains("未同步"));
    }

    private boolean isFrozenGrantDelayError(Map<String, Object> resp) {
        if (resp == null) return false;
        String code = String.valueOf(resp.getOrDefault("code", ""));
        String errMsg = String.valueOf(resp.getOrDefault("errMsg", ""));
        return "44301006".equals(code)
                || (StringUtils.hasText(errMsg) && errMsg.contains("冻结人员不能授权"));
    }

    private boolean isRetryableBatchFailure(Map<String, Object> resp) {
        return isPersonSyncDelayError(resp) || isFrozenGrantDelayError(resp);
    }

    private void sleepQuietly(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
