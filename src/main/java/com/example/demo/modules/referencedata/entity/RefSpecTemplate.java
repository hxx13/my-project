package com.example.demo.modules.referencedata.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class RefSpecTemplate {
    private Long id;
    private String name;
    private String scope;
    private String breedType;
    private String options;
    private LocalDateTime createdAt;
}
