package com.example.demo.modules.student.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.time.LocalDate;
import java.util.List;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class StudentStatsResponse {

    private PeriodInfo period;
    private SummaryInfo summary;
    private List<DailyTrend> dailyTrend;
    private List<HourlyDist> hourlyDistribution;
    private List<RoomDist> roomDistribution;
    private List<StayDuration> avgStayDuration;

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class PeriodInfo {
        private LocalDate start;
        private LocalDate end;
        private int days;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class SummaryInfo {
        private int totalAccess;
        private double dailyAvg;
        private int attendanceDays;
        private int roomCount;
        private int violationCount;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class DailyTrend {
        private LocalDate date;
        private int count;
        private int entryCount;
        private int exitCount;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class HourlyDist {
        private String bucket;
        private int count;
        private int entryCount;
        private int exitCount;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class RoomDist {
        private String roomName;
        private int count;
        private int percentage;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class StayDuration {
        private String roomName;
        private int durationMinutes;
    }
}
