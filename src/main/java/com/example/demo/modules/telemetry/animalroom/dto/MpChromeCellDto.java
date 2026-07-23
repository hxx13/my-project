package com.example.demo.modules.telemetry.animalroom.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class MpChromeCellDto {
    /** 套间卡；与侧栏-only 单元互斥 */
    private MpPreparedSuiteDto prepared;
    private String suiteLatestText;
    /**
     * Web（hubClient=web）：与末行带开关套间并排，最多 4 张「单房间 · 单测点」卡，前端 2×2。
     */
    @JsonInclude(JsonInclude.Include.NON_EMPTY)
    private List<MpRoomCardDto> webSoloMicroGrid;
    /**
     * Web：与末行「两可见间 × 各三项」TRIPLE_PACK chrome 并排，最多 3 套「标题槽一测点 + 可见间一测点」完整套间壳。
     */
    @JsonInclude(JsonInclude.Include.NON_EMPTY)
    private List<MpPreparedSuiteDto> webSidecarPreparedSuites;
}
