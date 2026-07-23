package com.example.demo.modules.telemetry.dto.archive;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TelemetryArchiveQueryPageDto {
    private long total;
    private int page;
    private int size;
    private List<TelemetryArchiveAdminRowDto> items;
}
