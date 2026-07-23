package com.example.demo.modules.twin.scan.dto.scan;

import lombok.Data;

@Data
public class ScanUserInfoDTO {
    private String userId;
    private Object name;
    private Object head;
    private Object group;
    private Object gender;
    private Object departmentName;
    private Object projectGroupName;
    private Object mobilePhone;
    private Object userTypeNames;
    private String dahuaSeq;
    private ScanUserRpgDTO rpg;
}
