package com.example.demo.modules.accessfusion.model;

import com.example.demo.modules.accessfusion.entity.AccessAuditSourceConfig;
import org.springframework.util.StringUtils;

/**
 * 与门禁记录库列表筛选维度一致（任务 / 通道 / 人员 / 开门类型 / 时间窗等）。
 */
public record AccessAuditFilterParams(
        Long taskId,
        String channelCode,
        String personCode,
        String personName,
        Integer openType,
        Integer enterOrExit,
        String startTime,
        String endTime,
        boolean requireMapping,
        boolean openSuccessOnly,
        String channelName,
        String cardNumber,
        String departmentName,
        Integer openResult,
        String audienceType,
        Integer mappingHit) {

    public static AccessAuditFilterParams fromConfig(AccessAuditSourceConfig cfg, String startTime, String endTime) {
        if (cfg == null) {
            return emptyTimeRange(startTime, endTime);
        }
        return new AccessAuditFilterParams(
                cfg.getSwingTaskId(),
                emptyToNull(cfg.getChannelCode()),
                emptyToNull(cfg.getPersonCode()),
                emptyToNull(cfg.getPersonName()),
                cfg.getOpenType(),
                null,
                startTime,
                endTime,
                cfg.getRequireMapping() != null && cfg.getRequireMapping() == 1,
                cfg.getOpenSuccessOnly() == null || cfg.getOpenSuccessOnly() == 1,
                null,
                null,
                null,
                null,
                null,
                null);
    }

    public static AccessAuditFilterParams emptyTimeRange(String startTime, String endTime) {
        return new AccessAuditFilterParams(
                null, null, null, null, null, null, startTime, endTime, false, false, null, null, null, null, null,
                null);
    }

    private static String emptyToNull(String s) {
        return StringUtils.hasText(s) ? s.trim() : null;
    }
}
