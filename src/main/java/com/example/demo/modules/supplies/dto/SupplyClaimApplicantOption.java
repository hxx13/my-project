package com.example.demo.modules.supplies.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/** 领用区间筛选：可选申请人（展示昵称与 userId） */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class SupplyClaimApplicantOption {
    private String userId;
    private String displayName;
}
