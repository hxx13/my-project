package com.example.demo.modules.facerecognition.dto;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 门禁验证并行比对：活体期间静默 Prefetch + 眨眼前早拒阈值。
 */
public record FaceVerifyPrefetchConfigDTO(
        boolean prefetchEnabled,
        int prefetchIntervalMs,
        double preLivenessRejectThreshold
) {
    public Map<String, Object> toMap() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("prefetchEnabled", prefetchEnabled);
        m.put("prefetchIntervalMs", prefetchIntervalMs);
        m.put("preLivenessRejectThreshold", preLivenessRejectThreshold);
        return m;
    }
}
