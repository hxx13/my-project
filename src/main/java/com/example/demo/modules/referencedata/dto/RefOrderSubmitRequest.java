package com.example.demo.modules.referencedata.dto;

import lombok.Data;

import java.util.List;

@Data
public class RefOrderSubmitRequest {
    private String groupId;
    private String submitterId;
    private String submitterName;
    private String projectGroupName;
    private String submitRemark;
    private List<RefCartUpsertRequest> lines;
}
