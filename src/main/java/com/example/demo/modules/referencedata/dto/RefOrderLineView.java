package com.example.demo.modules.referencedata.dto;

import lombok.Data;

@Data
public class RefOrderLineView {
    private Long id;
    private Long orderId;
    private Long refDataId;
    private String specSelections;
    private Object hierarchyChain;
    private Integer quantity;
    private String lineRemark;
    private String addedBy;
    /** 加购人展示名（staffId / 19 位 id 统一解析） */
    private String addedByName;
    private Long aupRecordId;
    /** 行级 AUP 编号（由 aup_record_id 解析，供审核页展示） */
    private String registerNo;
}
