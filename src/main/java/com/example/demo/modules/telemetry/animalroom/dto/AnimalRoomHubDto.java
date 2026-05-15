package com.example.demo.modules.telemetry.animalroom.dto;

import com.example.demo.modules.telemetry.dto.TelemetrySnapshotDto;
import com.example.demo.modules.telemetry.dto.TelemetryWinccDockPollConfigDto;
import com.example.demo.modules.twin.dto.RoomDashboardRenderDTO;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

/**
 * 动物房 Hub 同源聚合：Web 与微信小程序共用同一响应结构；
 * 与 {@code GET /api/v1/twin/dashboard/wechat-overview} 中房间列表同源（经服务端一次组装）。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AnimalRoomHubDto {
    private TelemetrySnapshotDto snapshot;
    private TelemetryWinccDockPollConfigDto dockPollConfig;
    @Builder.Default
    private List<MpStructuredTabDto> structuredTabs = new ArrayList<>();
    /**
     * 建议客户端轮询本接口的间隔（毫秒）；null 表示当前不必轮询（关窗、关计划、无数据等）。
     */
    private Integer clientPollIntervalMs;
    /**
     * 运行状态房间列表，与 {@code TwinDashboardAggregationService#getWechatMiniProgramData} 同源。
     */
    @Builder.Default
    private List<RoomDashboardRenderDTO> runningStatusRooms = new ArrayList<>();
}
