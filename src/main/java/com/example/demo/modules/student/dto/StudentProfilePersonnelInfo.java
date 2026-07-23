package com.example.demo.modules.student.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class StudentProfilePersonnelInfo {
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
