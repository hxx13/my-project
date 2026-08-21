package com.example.demo.modules.referencedata.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class RefCart {
    private Long id;
    private String groupId;
    private Long refDataId;
    /** 加购锁定的 AUP → aup_record.id */
    private Long aupRecordId;
    private String specSelections;
    private Integer quantity;
    private String remark;
    /** DRAFT | READY：实验员订单包状态（非正式单） */
    private String packageStatus;
    /** 实验员提交订单包时的统一备注 */
    private String packageRemark;
    private String addedBy;
    private LocalDateTime addedAt;
}
