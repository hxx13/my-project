package com.example.demo.modules.pagepermission.dto;

import lombok.Data;

@Data
public class UpdatePagePermissionRequest {
    private String minRole;
    private Integer enabled;
}

