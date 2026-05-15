package com.example.demo.modules.telemetry.animalroom.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

/** 与 Web prepareSuiteDisplay 一致：套间壳 + 标题槽位 + 可见房间卡 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MpPreparedSuiteDto {
    private MpSuiteGroupDto suite;
    @Builder.Default
    private List<MpMetricSlotDto> titleSlots = new ArrayList<>();
    @Builder.Default
    private List<MpRoomCardDto> visibleRooms = new ArrayList<>();
}
