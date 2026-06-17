package com.example.demo.modules.facerecognition.dto;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 前端活体/录入动作配置（环境变量 seed → DB 热改 → GET /api/face/config 下发）。
 */
public record FaceLivenessConfigDTO(
        boolean verifyBlinkEnabled,
        boolean verifyTurnEnabled,
        int verifyTurnHoldMs,
        boolean enrollBlinkEnabled,
        boolean enrollTurnLeftEnabled,
        boolean enrollTurnRightEnabled,
        int enrollTurnHoldMs,
        int enrollHoldStillSeconds
) {
    public Map<String, Object> toMap() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("verifyBlinkEnabled", verifyBlinkEnabled);
        m.put("verifyTurnEnabled", verifyTurnEnabled);
        m.put("verifyTurnHoldMs", verifyTurnHoldMs);
        m.put("enrollBlinkEnabled", enrollBlinkEnabled);
        m.put("enrollTurnLeftEnabled", enrollTurnLeftEnabled);
        m.put("enrollTurnRightEnabled", enrollTurnRightEnabled);
        m.put("enrollTurnHoldMs", enrollTurnHoldMs);
        m.put("enrollHoldStillSeconds", enrollHoldStillSeconds);
        return m;
    }
}
