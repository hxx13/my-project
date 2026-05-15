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
public class MpRoomCardDto {
    private String tabKey;
    private String floorCode;
    private String bundleCode;
    private String bundleTitle;
    private String roomCanonical;
    private String sortKey;
    private String displayTitle;
    @Builder.Default
    private List<MpMetricSlotDto> metrics = new ArrayList<>();
}
