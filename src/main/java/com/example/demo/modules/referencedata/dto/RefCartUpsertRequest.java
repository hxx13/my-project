package com.example.demo.modules.referencedata.dto;

import lombok.Data;

import java.util.Map;

@Data
public class RefCartUpsertRequest {
    private Long refDataId;
    private Map<String, String> specSelections;
    private Integer quantity;
    private String remark;
}
