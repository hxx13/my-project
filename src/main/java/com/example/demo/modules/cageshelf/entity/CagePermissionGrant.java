package com.example.demo.modules.cageshelf.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** 权限矩阵：capability_code + identity_code 唯一。勾选 = 授予。 */
@Data
public class CagePermissionGrant {
    private Long id;
    private String capabilityCode;
    private String identityCode;
    private LocalDateTime createdAt;
}
