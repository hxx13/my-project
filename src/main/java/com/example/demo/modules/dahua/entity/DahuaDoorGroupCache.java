package com.example.demo.modules.dahua.entity;

import lombok.Data;

@Data
public class DahuaDoorGroupCache {
    private Long id;
    private String name;
    private String orgCode;
    private String orgName;
    private Integer hasChildChannel;
    private String memo;
    private String updatedAt;
}
