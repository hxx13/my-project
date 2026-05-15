package com.example.demo.modules.purchase.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
public class PurchaseOrderView {
    private String id;
    private String applicantId;
    private String applicantName;
    private String location;
    private String content;
    private String status;
    private List<String> requestImages;
    private List<String> resultImages;
    private String resultRemark;
    private String processorId;
    /** 接单/处理人展示名（人员库或账号名） */
    private String processorName;
    private Integer isPublic;
    private LocalDateTime createTime;
    private LocalDateTime startTime;
    private LocalDateTime finishTime;
}
