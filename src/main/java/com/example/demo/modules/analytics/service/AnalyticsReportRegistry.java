package com.example.demo.modules.analytics.service;

import com.example.demo.modules.analytics.dto.AnalyticsReportDescriptorDto;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 可扩展报表目录：新增报表时在此注册元数据，并实现对应 Service + 前端 Report 组件。
 */
@Component
public class AnalyticsReportRegistry {

    public static final String REPORT_ISOLATION_USAGE = "isolation_usage";
    public static final String REPORT_CAGE_OCCUPANCY = "cage_occupancy";

    public List<AnalyticsReportDescriptorDto> listReports() {
        return List.of(
                new AnalyticsReportDescriptorDto(
                        REPORT_ISOLATION_USAGE,
                        "隔离服使用统计",
                        "支持校区/分区/楼层筛选。",
                        "门禁与房间",
                        true
                ),
                new AnalyticsReportDescriptorDto(
                        REPORT_CAGE_OCCUPANCY,
                        "笼架占用统计",
                        "统计已预约且已放置笼盒的笼位数（实时 ARO 快照），筛选方式与隔离服统计一致。",
                        "笼架与预约",
                        true
                )
        );
    }

    public boolean isKnownReport(String reportKey) {
        if (reportKey == null || reportKey.isBlank()) {
            return false;
        }
        return listReports().stream().anyMatch(r -> r.getKey().equals(reportKey.trim()));
    }
}
