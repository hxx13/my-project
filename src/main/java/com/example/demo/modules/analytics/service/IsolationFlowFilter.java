package com.example.demo.modules.analytics.service;

import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;

/** 隔离服辅助口径：ARO 流水 {@code aro_access_log}，校区/楼层/房间/动作/黑名单。 */
public record IsolationFlowFilter(
        List<String> campuses,
        List<String> floors,
        String roomName,
        Integer actionType,
        boolean excludeBlacklist) {

    public static IsolationFlowFilter fromAnalytics(AnalyticsFilterParams params) {
        if (params == null) {
            return new IsolationFlowFilter(List.of(), List.of(), null, null, true);
        }
        List<String> campuses =
                params.campuses() != null
                        ? params.campuses().stream().filter(StringUtils::hasText).map(String::trim).toList()
                        : List.of();
        List<String> floors =
                params.floors() != null
                        ? params.floors().stream().filter(StringUtils::hasText).map(String::trim).toList()
                        : List.of();
        String room = StringUtils.hasText(params.roomName()) ? params.roomName().trim() : null;
        return new IsolationFlowFilter(
                new ArrayList<>(campuses),
                new ArrayList<>(floors),
                room,
                params.actionType(),
                params.excludeBlacklist());
    }
}
