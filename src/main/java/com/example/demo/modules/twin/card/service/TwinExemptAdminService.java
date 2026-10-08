package com.example.demo.modules.twin.card.service;

import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.notification.push.dispatch.PushService;
import com.example.demo.modules.twin.card.support.ExemptChangeContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;

/**
 * 管理员设置冻结豁免（授予 / 收回）的完整编排。
 *
 * <p><b>这个类存在的唯一理由</b>：授予豁免不是「调一次 Service」就完了 ——
 * 后面还要给学生推一条 {@code SCAN_DELAY_MANUAL} 通知。这两步原来只写在
 * {@code TwinMappingController#updateExemptFlag} 里，任何绕过 Controller 的调用方
 * （例如 AI 工具）若只调 {@code TwinCardMappingService}，豁免会生效但**学生收不到通知** ——
 * 操作看起来成功，实际少了一半。
 *
 * <p>所以把这段抽出来，HTTP 入口与工具调**同一个方法**（设计文档 §7.1）。
 * 逻辑与原 Controller 内联版本逐行一致，包括校验顺序、文案、日志与异步推送的写法。
 *
 * <p>校验失败抛 {@link IllegalArgumentException}，文案与原 {@code Result.error(...)} 完全相同 ——
 * Controller 捕获后返回的响应与改动前一字不差。
 */
@Service
public class TwinExemptAdminService {

    private static final Logger log = LoggerFactory.getLogger(TwinExemptAdminService.class);

    private final TwinCardMappingService mappingService;
    private final PushService pushService;
    private final UserDisplayNameService displayNameService;

    public TwinExemptAdminService(TwinCardMappingService mappingService,
                                  PushService pushService,
                                  UserDisplayNameService displayNameService) {
        this.mappingService = mappingService;
        this.pushService = pushService;
        this.displayNameService = displayNameService;
    }

    /**
     * 设置豁免标记并（授予时）通知本人。
     *
     * @param operatorUserId 操作人，来自调用方身份；**不从参数里读身份**
     * @throws IllegalArgumentException 校验不通过（文案与 HTTP 入口一致）
     */
    public Map<String, Object> apply(String operatorUserId, String cardNo, int flag,
                                     Integer durationMinutes, String mode, Integer maxCount,
                                     String roomIds, String extendUntilTime, String client) {
        if (flag == 1) {
            boolean hasUntil = extendUntilTime != null && !extendUntilTime.isBlank();
            if ((mode.equals("TIME") || mode.equals("BOTH")) && durationMinutes == null && !hasUntil) {
                throw new IllegalArgumentException("时长限制模式须选择延长至时点（extendUntilTime）");
            }
            if ((mode.equals("COUNT") || mode.equals("BOTH")) && maxCount == null) {
                throw new IllegalArgumentException("次数限制模式须指定次数（maxCount）");
            }
        }

        Map<String, Object> updated = mappingService.updateExemptFlag(
                cardNo, flag, durationMinutes, mode, maxCount, roomIds, extendUntilTime,
                ExemptChangeContext.manualAdmin(operatorUserId, client));
        log.info("[twin] exempt cardNo={} flag={} mode={} maxCount={} by userId={}",
                cardNo, flag, mode, maxCount, operatorUserId);

        // 授予豁免时异步推送通知给学生（不阻塞调用方）
        if (flag == 1 && updated != null) {
            String subjectUserId = (String) updated.get("aroUserId");
            if (subjectUserId != null && !subjectUserId.isBlank()) {
                String roomDisplay = extractRoomNames(roomIds);
                String optionDesc = describeExemptMode(mode, durationMinutes, maxCount, extendUntilTime);
                String operatorName = displayNameService.resolveDisplayName(operatorUserId);
                CompletableFuture.runAsync(() -> {
                    try {
                        pushService.send("SCAN_DELAY_MANUAL",
                                Map.of("roomName", roomDisplay,
                                       "optionLabel", optionDesc,
                                       "operatorName", operatorName),
                                Set.of(subjectUserId.trim()));
                        log.info("[Push] SCAN_DELAY_MANUAL sent via exempt service: userId={}", subjectUserId);
                    } catch (Exception e) {
                        log.warn("[Push] SCAN_DELAY_MANUAL failed in exempt service: {}", e.getMessage());
                    }
                });
            }
        }
        return updated;
    }

    static String extractRoomNames(String roomIds) {
        if (roomIds == null || roomIds.isBlank()) return "指定房间";
        // 尝试解析 JSON 数组提取 roomName
        try {
            com.fasterxml.jackson.databind.ObjectMapper om = new com.fasterxml.jackson.databind.ObjectMapper();
            var list = om.readValue(roomIds, java.util.List.class);
            if (list.isEmpty()) return "指定房间";
            StringBuilder sb = new StringBuilder();
            for (var item : list) {
                if (item instanceof java.util.Map<?, ?> m) {
                    Object name = m.get("roomName");
                    if (name != null && !name.toString().isBlank()) {
                        if (!sb.isEmpty()) sb.append("、");
                        sb.append(name);
                    }
                }
            }
            return sb.isEmpty() ? "指定房间" : sb.toString();
        } catch (Exception e) {
            // 非 JSON → 原样返回（如逗号分隔的纯 roomId 列表）
            return roomIds.replaceAll("[\\[\\]\"]", "").trim();
        }
    }

    static String describeExemptMode(String mode, Integer durationMinutes, Integer maxCount, String extendUntilTime) {
        if ("COUNT".equals(mode)) {
            return "次数限制 · 可用 " + (maxCount != null ? maxCount : "?") + " 次";
        } else if ("TIME".equals(mode)) {
            String until = extendUntilTime != null && !extendUntilTime.isBlank()
                    ? "至 " + extendUntilTime
                    : (durationMinutes != null && durationMinutes > 0
                        ? durationMinutes + " 分钟"
                        : "已授权");
            return "时长限制 · " + until;
        } else if ("BOTH".equals(mode)) {
            String until = extendUntilTime != null && !extendUntilTime.isBlank()
                    ? "至 " + extendUntilTime
                    : (durationMinutes != null && durationMinutes > 0
                        ? durationMinutes + " 分钟"
                        : "已授权");
            return "时长+次数限制 · " + until + " · 可用 " + (maxCount != null ? maxCount : "?") + " 次";
        }
        return "已授权";
    }
}
