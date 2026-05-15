package com.example.demo.modules.telemetry.animalroom.dto;

import com.example.demo.modules.telemetry.dto.TelemetryTagItemDto;
import com.example.demo.modules.twin.dto.RoomDashboardRenderDTO;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * 动物房温湿度页专用：一次 GET 返回渲染所需数据（无嵌套「快照」壳层）。
 */
@Data
@Builder(toBuilder = true)
@NoArgsConstructor
@AllArgsConstructor
public class AnimalRoomTelemetryPageDto {
    private Instant fetchedAt;
    private boolean winccEnabled;
    @Builder.Default
    private List<MpStructuredTabDto> tabs = new ArrayList<>();
    /**
     * 仅当 {@code GET /animal-room?telemetryTabKey=__hvac_units__} 时下发：机房合成 viewChunks（含各层 zoneBand），
     * 与小程序/Web 侧栏「机房」Tab 一致；其它请求为 null 或空。
     */
    @Builder.Default
    private List<MpViewChunkDto> hvacMechanicalHubViewChunks = new ArrayList<>();
    /** 原始测点行；无结构化页签时客户端可做简单列表兜底 */
    @Builder.Default
    private List<TelemetryTagItemDto> tagItems = new ArrayList<>();
    /** 建议轮询间隔（毫秒）；null 表示当前不必轮询 */
    private Integer pollIntervalMs;
    @Builder.Default
    private List<RoomDashboardRenderDTO> runningStatusRooms = new ArrayList<>();
}
