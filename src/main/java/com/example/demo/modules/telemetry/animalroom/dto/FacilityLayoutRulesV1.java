package com.example.demo.modules.telemetry.animalroom.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

import java.util.List;

/**
 * 动物房设施：路径折叠（小房间关键字）、供水/套间标题行分级、地下室 Web chrome 等；与前端
 * {@code facilityLayoutConfig.ts} 同形。
 * <p>存于系统设置 {@code telemetry_facility.telemetry.facility.rules_json}。</p>
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class FacilityLayoutRulesV1 {

    private int version = 1;

    /**
     * 路径段「设施小房间」关键字，命中时 …-关键字-01/02 收为同一张卡；建议长词在前。
     * 套间段名（如动力站、锅炉房）不要放在此列表，应作为套间名保留在路径中。
     */
    private List<String> facilitySmallRoomKeywords;

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class GongShuiConfig {
        private List<String> segmentEquals;
        private List<String> segmentContains;
    }

    private GongShuiConfig gongShui;

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class TitleMetricConfig {
        private List<String> kindCodePrefixes;
        private List<String> labelContainsAny;
    }

    private TitleMetricConfig titleMetric;

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class SuiteTokensConfig {
        private List<String> tokens;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class SuiteRecognition {
        private SuiteTokensConfig powerStation;
        private SuiteTokensConfig boilerRoom;
    }

    private SuiteRecognition suiteRecognition;

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class BasementWebChrome {
        /** 地下室 Web：suiteNorm 含任一则该套间 chrome 独占一行 */
        private List<String> exclusiveRowIfSuiteNormContains;
        /**
         * 与「带开关套间」同排时行内 cap=2 的套间：suiteNorm 含任一则视为可参与「开关行」合并判断
         */
        private List<String> boilerSwitchRowMergeIfSuiteNormContains;
    }

    private BasementWebChrome basementWebChrome;
}
