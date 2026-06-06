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
        /** 头像 URL（来自 ARO 人员库） */
        private String head;
        /** 性别：0=未知 1=男 2=女 */
        private Integer gender;
        private String mobilePhone;
        private String email;
        /** 总经验值 */
        private Integer totalExp;
        /** 官方可进房间列表（中文展示） */
        private String allowedRoomsDisplayZh;
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
        private String roomId;
        private String roomName;
        private String floor;
        private String zone;
        private int occupantCount;
        private int capacity;
        private double occupancyRate;
        private String status;
        private boolean isPinned;
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
