package com.example.demo.modules.dahua.entity;

import lombok.Data;

@Data
public class DahuaDepartmentCache {
    private Long id;
    private Long parentId;
    private String name;
    private String memo;
    private Integer sort;
    private String parentIds;
    private String departmentSn;
    private String domainId;
    private String updatedAt;
}
