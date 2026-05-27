package com.example.demo.modules.telemetry.dto.archive;

/**
 * 写入 {@code telemetry_value_archive} 的最小字段集（与 WinCC 快照解耦，避免归档服务依赖展示 DTO）。
 */
public record TelemetryArchiveIngestItem(
        String variableName,
        String value,
        String metricKindCode,
        String roomCanonical,
        String bundleCode) {

    public static TelemetryArchiveIngestItem of(
            String variableName,
            String value,
            String metricKindCode,
            String roomCanonical,
            String bundleCode) {
        return new TelemetryArchiveIngestItem(
                variableName, value, metricKindCode, roomCanonical, bundleCode);
    }
}
