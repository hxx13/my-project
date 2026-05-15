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
public class MpStructuredTabDto {
    private String tabKey;
    private String title;
    private int roomCount;
    private int suiteCount;
    @Builder.Default
    private List<MpViewChunkDto> viewChunks = new ArrayList<>();
}
