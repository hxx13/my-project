package com.example.demo.modules.student.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class StudentActivityResponse {

    private String groupName;
    private GroupSummary groupSummary;
    private MyActivity myActivity;

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class GroupSummary {
        private int memberCount;
        private int totalEntries;
        private double perCapitaWeeklyFreq;
        private double activeSharePct;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class MyActivity {
        private int totalEntries;
        private double weeklyAvgFreq;
        private long totalDurationMinutes;
        private String lastActiveDate;
    }
}
