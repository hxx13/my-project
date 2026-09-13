package com.example.demo.modules.cageshelf.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** 组员级能力勾选：user_id（= personnel.id）+ capability_code 唯一。有行即以它为准（全量覆盖矩阵）。 */
@Data
public class CageMemberCapability {
    private Long id;
    private String userId;
    private String capabilityCode;
    private String grantedBy;
    private LocalDateTime createdAt;
}
