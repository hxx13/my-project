package com.example.demo.modules.twin.dashboard.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
public class CageStatusViolationDTO {
    private Long id;
    private Long ruleId;
    private String ruleName;
    private String scanBatchId;
    private String statusCode;
    private Long cageShelveId;
    private Integer positionX;
    private Integer positionY;
    private String positionLabel;
    private String cageBoxQrCode;
    private String projectPiName;
    private String projectGroupName;
    private String departmentName;
    private String roomName;
    private String campusName;
    private LocalDateTime triggeredAt;
    private String status;
    /** 该父记录下全部子记录数（含已解除/已过期；与展开成员列表行数一致） */
    private Integer memberCount;
    /** 当前 ACTIVE 子记录数（分组可见性依据：至少一条生效才展示） */
    private Integer activeMemberCount;
    private List<MemberViolationDTO> members;

    @Data
    public static class MemberViolationDTO {
        private Long violationId;
        private String userId;
        private String displayName;
        private String departmentName;
        private String status;
        private LocalDateTime createdAt;
    }
}
