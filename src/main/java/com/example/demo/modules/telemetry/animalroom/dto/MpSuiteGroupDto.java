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
public class MpSuiteGroupDto {
    private String tabKey;
    private String floorCode;
    private String bundleCode;
    private String bundleTitle;
    private String suiteNorm;
    private String suiteTitle;
    private String sortKey;
    @Builder.Default
    private List<MpRoomCardDto> rooms = new ArrayList<>();
}
