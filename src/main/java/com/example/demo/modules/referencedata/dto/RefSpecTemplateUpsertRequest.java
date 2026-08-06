package com.example.demo.modules.referencedata.dto;

import lombok.Data;

import java.util.Map;

@Data
public class RefSpecTemplateUpsertRequest {
    private String name;
    private String scope;
    private String breedType;
    private Map<String, Object> options;
}
