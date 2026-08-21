package com.example.demo.modules.referencedata.dto;

import lombok.Data;

import java.util.Map;

@Data
public class RefCartUpsertRequest {
    private Long refDataId;
    /** 加购必填：当前锁定的 AUP */
    private Long aupRecordId;
    private Map<String, String> specSelections;
    private Integer quantity;
    /** 已停用加购备注路径；保留字段兼容旧客户端 */
    private String remark;
    /** 提交订单时可选：保留加购人（PI 代提时从购物车复制；显式 lines 可带） */
    private String addedBy;
    /** 提交订单时可选：行备注（可快照自 packageRemark） */
    private String lineRemark;
    /** DRAFT | READY */
    private String packageStatus;
    private String packageRemark;
}
