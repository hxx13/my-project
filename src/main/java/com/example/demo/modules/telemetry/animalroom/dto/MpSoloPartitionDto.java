package com.example.demo.modules.telemetry.animalroom.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MpSoloPartitionDto {
    private String label;
    /** 副标题：原「单间 · 三项参数」等分桶来源，按分区合并后可选 */
    private String zoneSub;
    @Builder.Default
    private List<MpSoloRowDto> rows = new ArrayList<>();
}
