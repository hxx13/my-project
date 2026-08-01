package com.example.demo.modules.material.dto;

import lombok.Data;
import java.util.List;

@Data
public class MaterialRequestView {
    private String id;
    private String userId;
    private String applicantName;
    private String applicantGroup;
    private String status;
    private String workflowType;
    private String firstReviewerId;
    private String firstReviewTime;
    private String secondReviewerId;
    private String secondReviewTime;
    private String fulfilledAt;
    private String fulfilledBy;
    private String receivedAt;
    private String createdAt;
    private String updatedAt;
    /** 预约领取时间 ISO 格式，nullable */
    private String scheduledPickupTime;
    /** 预约通知是否已发送：0=未发，1=已发 */
    private Integer notificationSent;
    private List<MaterialRequestLineView> lines;
}
