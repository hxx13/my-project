package com.example.demo.modules.telemetry.animalroom.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

/**
 * 温湿度主区结构化块（Web / 小程序同源 JSON，与前端 buildViewChunks 输出对齐）。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class MpViewChunkDto {
    /** suite | chromeSuiteRow | solos | zoneBand */
    private String kind;
    private String key;
    /** kind=zoneBand 时：E10 / E11A 等平面分区标题 */
    private String zoneLabel;
    private Boolean suiteHalfRow;
    private String suiteLatestText;
    private MpPreparedSuiteDto prepared;
    private String rowKind;
    @Builder.Default
    private List<MpChromeCellDto> list = new ArrayList<>();
    @Builder.Default
    private List<MpSoloPartitionDto> partitions = new ArrayList<>();
}
