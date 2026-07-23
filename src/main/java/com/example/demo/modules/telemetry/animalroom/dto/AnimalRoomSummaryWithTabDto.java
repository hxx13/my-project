package com.example.demo.modules.telemetry.animalroom.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 小程序一次 HTTP 同时拿「全 tab 摘要」与「单层明细」，避免两次 GET 各触发一遍 WinCC/组装。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AnimalRoomSummaryWithTabDto {
    /** 与 GET /animal-room?telemetrySummaryOnly=true 同源 */
    private AnimalRoomTelemetryPageDto summary;
    /** 与 GET /animal-room?telemetryTabKey= 同源 */
    private AnimalRoomTelemetryPageDto tabDetail;
}
