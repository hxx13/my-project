package com.example.demo.modules.referencedata.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class RefSpecTemplateView {
    private Long id;
    private String name;
    private String scope;
    private String breedType;
    private String options;
    private LocalDateTime createdAt;
}
