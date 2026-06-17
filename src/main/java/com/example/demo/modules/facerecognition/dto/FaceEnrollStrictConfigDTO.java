package com.example.demo.modules.facerecognition.dto;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 录入严模式阈值（客户端 face-api 帧间互配；与路线 B 服务端余弦阈值尺度不同）。
 */
public record FaceEnrollStrictConfigDTO(
        double pairMinSim,
        int minCountAbovePair,
        double maxPairSim,
        double top2AvgMin
) {
    public Map<String, Object> toMap() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("pairMinSim", pairMinSim);
        m.put("minCountAbovePair", minCountAbovePair);
        m.put("maxPairSim", maxPairSim);
        m.put("top2AvgMin", top2AvgMin);
        return m;
    }
}
