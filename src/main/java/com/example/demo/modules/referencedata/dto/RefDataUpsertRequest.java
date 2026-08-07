package com.example.demo.modules.referencedata.dto;

import lombok.Data;

import java.util.Map;

@Data
public class RefDataUpsertRequest {
    private Long parentId;
    private Integer sortOrder;
    private Integer status;
    private Map<String, Object> fieldData;
}
