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
    public static final String REPORT_STUDENT_ACTIVITY = "student_activity";
    public static final String REPORT_CAGE_SPECIAL_STATUS = "cage_special_status";

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
                ),
                new AnalyticsReportDescriptorDto(
                        REPORT_STUDENT_ACTIVITY,
                        "学生活跃度统计",
                        "按课题组筛选成员，查看进出次数、在馆时长、时段热力等活跃度指标。",
                        "人员与活跃度",
                        true
                ),
                new AnalyticsReportDescriptorDto(
                        REPORT_CAGE_SPECIAL_STATUS,
                        "笼位特殊状态统计",
                        "汇总合笼/繁殖、特殊饲养、请分笼、健康异常、动物转移等特殊状态笼位，支持按校区/房间/课题组筛选。",
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
