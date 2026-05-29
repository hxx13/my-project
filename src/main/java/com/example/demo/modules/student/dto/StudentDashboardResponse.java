package com.example.demo.modules.student.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.util.List;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class StudentDashboardResponse {

    private ProfileSummary profile;
    private StatsSummary stats;
    private List<PinnedRoom> pinnedRooms;
    private List<RecentRecord> recentRecords;
    private List<RecentNotice> recentNotices;

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ProfileSummary {
        private String name;
        private String departmentName;
        private String projectGroupName;
        private String roleLabel;
        private String authStatus;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class StatsSummary {
        private int todayAccessCount;
        private int violationCount;
        private int unreadNoticeCount;
        private int accessibleRoomCount;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class PinnedRoom {
        private String roomName;
        private String floor;
        private String zone;
        private int occupantCount;
        private int capacity;
        private String status;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class RecentRecord {
        private String time;
        private String type;
        private String roomName;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class RecentNotice {
        private String title;
        private String type;
        private String publishDate;
    }
}
