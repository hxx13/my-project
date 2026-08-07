package com.example.demo.modules.referencedata.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
public class RefOrderView {
    private Long id;
    private String groupId;
    private String submitterId;
    private String submitterName;
    private String projectGroupName;
    private String status;
    private String submitRemark;
    private LocalDateTime submittedAt;
    private LocalDateTime createdAt;
    private List<RefOrderLineView> lines;
}
