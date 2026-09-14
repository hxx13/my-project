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
    /** Web 学生首页指标卡片（课题组人员 / AUP / 笼位预约） */
    private HomeSummary homeSummary;

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ProfileSummary {
        private String name;
        /** 工号（= 学号） */
        private String jobNumber;
        private String departmentName;
        private String projectGroupName;
        /** 身份标识（本地身份标识系统 person_identity_tag.label，可多个） */
        private List<String> identityLabels;
        private String authStatus;
        /** 头像 URL（来自 ARO 人员库） */
        private String head;
        /** 性别：0=未知 1=男 2=女 */
        private Integer gender;
        private String mobilePhone;
        private String email;
        /** 是否校内 0/1 */
        private Integer isSchool;
        /** 官方可进房间列表（中文展示） */
        private String allowedRoomsDisplayZh;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class HomeSummary {
        /** 本课题组人员数（含本人）。只出人数不出名单 —— 首页不提供成员名单查看入口 */
        private int groupMemberCount;
        /** 本课题组 AUP 计划书数（与 /student/aup 同口径） */
        private int aupCount;
        /** 本课题组剩余笼位 = Σ(预约数量 − 已使用)，跨房间跨 AUP 合并 */
        private int cageRemaining;
        private List<RoomRemaining> remainingByRoom;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class RoomRemaining {
        private String roomName;
        private int rentNumber;
        private int usedNumber;
        private int remaining;
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
