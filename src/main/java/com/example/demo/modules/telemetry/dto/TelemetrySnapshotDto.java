package com.example.demo.modules.telemetry.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.Collections;
import java.util.List;

/**
 * 供 Web / 小程序使用的统一快照结构。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TelemetrySnapshotDto {

    /** 是否启用 WinCC 拉取（app.wincc.enabled） */
    private boolean winccEnabled;

    /**
     * 最近一次成功从 WinCC 取数的时间；从未成功则为 null。
     */
    private Instant fetchedAt;

    /** 最近一次成功时的测点列表（失败时保留上一版成功数据）。 */
    private List<TelemetryTagItemDto> items;

    /**
     * 最近一次拉取失败原因；成功则为 null。
     * 未启用时可为说明文案。
     */
    private String lastError;

    /**
     * 最近一次定时/手动刷新是否整体成功（不含单点 Not Found）。
     */
    private boolean winccReachable;

    public static TelemetrySnapshotDto disabled(String message) {
        return TelemetrySnapshotDto.builder()
                .winccEnabled(false)
                .fetchedAt(null)
                .items(Collections.emptyList())
                .lastError(message)
                .winccReachable(false)
                .build();
    }
}
