package com.example.demo.modules.telemetry.service;

import com.example.demo.modules.telemetry.dto.archive.TelemetryFleetMatrixDto;
import com.example.demo.modules.telemetry.dto.archive.TelemetryViewSnapshotDto;
import com.example.demo.modules.telemetry.dto.archive.TelemetryViewSnapshotPageDto;
import com.example.demo.modules.telemetry.entity.TelemetryViewSnapshotRow;
import com.example.demo.modules.telemetry.mapper.TelemetryViewSnapshotMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class TelemetryViewSnapshotService {

    private static final Logger log = LoggerFactory.getLogger(TelemetryViewSnapshotService.class);

    private final TelemetryViewSnapshotMapper snapshotMapper;
    private final TelemetryArchiveService archiveService;
    private final ObjectMapper objectMapper;

    public TelemetryViewSnapshotService(
            TelemetryViewSnapshotMapper snapshotMapper,
            TelemetryArchiveService archiveService,
            ObjectMapper objectMapper) {
        this.snapshotMapper = snapshotMapper;
        this.archiveService = archiveService;
        this.objectMapper = objectMapper;
    }

    public Map<String, Object> captureSnapshot(String profileCode, LocalDateTime from, LocalDateTime to, Long chartGroupId) {
        String profile = profileCode == null ? "PRESENTATION" : profileCode.trim().toUpperCase();
        LocalDateTime effTo = to == null ? LocalDateTime.now() : to;
        LocalDateTime effFrom = from == null ? effTo.minusHours(24) : from;
        TelemetryFleetMatrixDto matrix = archiveService.queryFleetMatrix(effFrom, effTo, "TEMP", null);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("fleetMatrixTemp", matrix);
        payload.put("profileCode", profile);
        try {
            String payloadJson = objectMapper.writeValueAsString(payload);
            Map<String, String> range = Map.of(
                    "from", effFrom.atZone(ZoneId.systemDefault()).toOffsetDateTime().toString(),
                    "to", effTo.atZone(ZoneId.systemDefault()).toOffsetDateTime().toString());
            TelemetryViewSnapshotRow row = new TelemetryViewSnapshotRow();
            row.setCapturedAt(LocalDateTime.now());
            row.setProfileCode(profile);
            row.setTimeRangeJson(objectMapper.writeValueAsString(range));
            row.setChartGroupId(chartGroupId);
            row.setPayloadJson(payloadJson);
            snapshotMapper.insert(row);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("snapshotId", row.getId());
            out.put("capturedAt", row.getCapturedAt());
            return out;
        } catch (Exception e) {
            log.warn("[遥测快照] capture 失败: {}", e.getMessage());
            throw new IllegalStateException("快照写入失败: " + e.getMessage());
        }
    }

    public TelemetryViewSnapshotPageDto listPage(int page, int size, LocalDateTime from, LocalDateTime to, String profileCode) {
        int p = Math.max(1, page);
        int s = Math.min(100, Math.max(1, size));
        long total = snapshotMapper.countPage(from, to, profileCode);
        List<TelemetryViewSnapshotRow> rows = snapshotMapper.selectPage(from, to, profileCode, (p - 1) * s, s);
        List<TelemetryViewSnapshotDto> items = new ArrayList<>();
        if (rows != null) {
            for (TelemetryViewSnapshotRow r : rows) {
                items.add(toDto(r));
            }
        }
        return TelemetryViewSnapshotPageDto.builder().total(total).page(p).size(s).items(items).build();
    }

    public TelemetryViewSnapshotDto getById(long id) {
        TelemetryViewSnapshotRow row = snapshotMapper.selectById(id);
        if (row == null) {
            throw new IllegalArgumentException("快照不存在: " + id);
        }
        return toDto(row);
    }

    private TelemetryViewSnapshotDto toDto(TelemetryViewSnapshotRow r) {
        ZoneId z = ZoneId.systemDefault();
        return TelemetryViewSnapshotDto.builder()
                .id(r.getId())
                .capturedAt(r.getCapturedAt() == null ? null : r.getCapturedAt().atZone(z).toOffsetDateTime().toString())
                .profileCode(r.getProfileCode())
                .timeRangeJson(r.getTimeRangeJson())
                .chartGroupId(r.getChartGroupId())
                .payloadJson(r.getPayloadJson())
                .createTime(r.getCreateTime() == null ? null : r.getCreateTime().atZone(z).toOffsetDateTime().toString())
                .build();
    }
}
