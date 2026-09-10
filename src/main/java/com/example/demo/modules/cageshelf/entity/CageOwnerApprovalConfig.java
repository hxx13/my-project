package com.example.demo.modules.cageshelf.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 所属人审核配置：三个开关按「所属人」持久化，取代原先全局的 cage.claim.* 配置。
 * owner_account_id 为 canonical 账号 id（STAFF_ 已展开成 ARO 编号），与认领/占用者同口径。
 * 无行 = 三个开关全部 true（默认需要审核）。
 */
@Data
public class CageOwnerApprovalConfig {
    private Long id;
    private String ownerAccountId;
    /** 1=审核通过后仍需到场扫码确认 */
    private Boolean confirmRequired;
    /** 1=分笼需审核 */
    private Boolean divideApprovalRequired;
    /** 1=转移笼位需审核 */
    private Boolean transferApprovalRequired;
    private String updateBy;
    private LocalDateTime updateTime;
    private LocalDateTime createdAt;
}
