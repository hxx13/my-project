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
    /** 领用方式/房间：房间节点 id（选购时必选） */
    private String pickupRoomId;
    /** 领用方式/房间：房间全路径名快照 */
    private String pickupRoomName;
    /** 领用人账号 id；为空表示下单人本人 */
    private String collectorId;
    /** 领用人显示名快照 */
    private String collectorName;
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
