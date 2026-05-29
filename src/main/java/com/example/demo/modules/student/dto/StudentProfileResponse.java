package com.example.demo.modules.student.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class StudentProfileResponse {

    private AccountInfo account;
    private PersonnelInfo personnel;
    private StatsInfo stats;

    @Data
    public static class AccountInfo {
        private String username;
        private String role;
        private String createTime;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class PersonnelInfo {
        private String userId;
        private String name;
        private Integer gender;
        private String mobilePhone;
        private String email;
        private String head;
        private String departmentName;
        private String projectGroupName;
        private String userTypeNames;
        private String allowedRoomsDisplayZh;
        private Integer hasOfficialRoomPermission;
        private Integer totalExp;
    }

    @Data
    public static class StatsInfo {
        private int recentAccessCount;
    }

    public static StudentProfileResponse empty() {
        StudentProfileResponse resp = new StudentProfileResponse();
        resp.setStats(new StatsInfo());
        return resp;
    }
}
