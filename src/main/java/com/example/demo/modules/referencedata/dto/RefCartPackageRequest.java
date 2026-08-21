package com.example.demo.modules.referencedata.dto;

import lombok.Data;

import java.util.List;

/** 实验员「订单包」：将本人购物车行标为 READY / 撤回 DRAFT（非正式审批）。 */
@Data
public class RefCartPackageRequest {
    /** 指定行 id；为空则作用于当前用户在该 groupId 下的全部 DRAFT/READY 行 */
    private List<Long> cartIds;
    /** READY 时写入的统一包备注 */
    private String packageRemark;
}
