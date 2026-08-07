package com.example.demo.modules.referencedata.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class RefCartView {
    private Long id;
    private String groupId;
    private Long refDataId;
    private String specSelections;
    private Integer quantity;
    private String remark;
    private String addedBy;
    private LocalDateTime addedAt;
}
