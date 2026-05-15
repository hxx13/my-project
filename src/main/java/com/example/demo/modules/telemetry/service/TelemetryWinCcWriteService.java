package com.example.demo.modules.telemetry.service;

import com.example.demo.modules.telemetry.client.WinCcRestTagClient;
import com.example.demo.modules.telemetry.dto.TelemetryTagItemDto;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;

/**
 * WinCC 变量远程写入：仅允许库中统一快照点名内的 SWITCH / SETPOINT；写入后读回并合并内存快照。
 */
@Service
public class TelemetryWinCcWriteService {

    private final WinCcRestTagClient winCcRestTagClient;
    private final TelemetryWatchlistDbService watchlistDbService;
    private final TelemetrySnapshotService telemetrySnapshotService;

    public TelemetryWinCcWriteService(WinCcRestTagClient winCcRestTagClient,
                                      TelemetryWatchlistDbService watchlistDbService,
                                      TelemetrySnapshotService telemetrySnapshotService) {
        this.winCcRestTagClient = winCcRestTagClient;
        this.watchlistDbService = watchlistDbService;
        this.telemetrySnapshotService = telemetrySnapshotService;
    }

    /**
     * PUT 写入 WinCC，再对被写变量 POST /Values，仅合并对应快照行（post-save-no-full-refresh.mdc）。
     */
    public TelemetryTagItemDto writeTagAndRefreshSnapshotRow(String variableName, Object value) {
        if (!StringUtils.hasText(variableName)) {
            throw new IllegalArgumentException("variableName 不能为空");
        }
        String vn = variableName.trim();
        if (!watchlistDbService.isVariableInUnifiedSnapshotPollList(vn)) {
            throw new IllegalArgumentException("变量不在当前 WinCC 快照点名清单或未启用 database 源");
        }
        String role = watchlistDbService.resolveNormalizedKindRoleForVariable(vn);
        if (!"SWITCH".equals(role) && !"SETPOINT".equals(role)) {
            throw new IllegalArgumentException("仅 kind_role 为 SWITCH 或 SETPOINT 的变量允许远程写入");
        }
        Object winCcValue = coercePayload(role, value);
        winCcRestTagClient.writeTagValue(vn, winCcValue);
        List<TelemetryTagItemDto> merged = telemetrySnapshotService.mergeWinCcReadingsIntoCachedSnapshot(List.of(vn));
        if (merged == null || merged.isEmpty()) {
            throw new IllegalStateException("写入成功但读回变量值为空");
        }
        return merged.get(0);
    }

    private static Object coercePayload(String kindRole, Object value) {
        if ("SWITCH".equals(kindRole)) {
            return coerceSwitchPayload(value);
        }
        return coerceSetpointPayload(value);
    }

    private static Object coerceSwitchPayload(Object value) {
        if (value instanceof Boolean b) {
            return b ? 1 : 0;
        }
        if (value instanceof Number n) {
            int i = n.intValue();
            if (i != 0 && i != 1) {
                throw new IllegalArgumentException("开关仅允许写入 0 或 1");
            }
            return i;
        }
        if (value instanceof String s && StringUtils.hasText(s)) {
            String t = s.trim();
            if ("1".equals(t) || "true".equalsIgnoreCase(t)) {
                return 1;
            }
            if ("0".equals(t) || "false".equalsIgnoreCase(t)) {
                return 0;
            }
        }
        throw new IllegalArgumentException("开关仅允许写入 0/1（或 true/false）");
    }

    private static Object coerceSetpointPayload(Object value) {
        if (value instanceof Number n) {
            return n;
        }
        if (value instanceof String s && StringUtils.hasText(s)) {
            String t = s.trim().replace(',', '.');
            try {
                Double.parseDouble(t);
            } catch (NumberFormatException e) {
                throw new IllegalArgumentException("设定值须为数字");
            }
            return t;
        }
        throw new IllegalArgumentException("设定值须为数字");
    }
}
