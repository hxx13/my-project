package com.example.demo.modules.referencedata.dto;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class RefOrderLineView {
    private Long id;
    private Long orderId;
    private Long refDataId;
    /** 供应商（ARO 导入的结构化品名；本地自建行靠 hierarchy_chain 解析） */
    private String supplierName;
    /** 品系（ARO 导入的结构化品名） */
    private String strainName;
    /** 规格（ARO 导入的结构化品名） */
    private String specName;
    private String specSelections;
    private Object hierarchyChain;
    private Integer quantity;
    /** 下单时单价快照（元）；下单时该物品未开启价格则为 null */
    private BigDecimal unitPrice;
    /** 小计 = unitPrice × quantity */
    private BigDecimal lineAmount;
    /** 实际到货日期（ARO 导入） */
    private String arrivalDate;
    /** 领用方式/房间：房间节点 id */
    private String pickupRoomId;
    /** 领用方式/房间：房间全路径名快照 */
    private String pickupRoomName;
    /** 领用人账号 id；空=下单人本人 */
    private String collectorId;
    /** 领用人显示名快照 */
    private String collectorName;
    private String lineRemark;
    private String addedBy;
    /** 加购人展示名（staffId / 19 位 id 统一解析） */
    private String addedByName;
    private Long aupRecordId;
    /** 行级 AUP 编号（由 aup_record_id 解析，供审核页展示） */
    private String registerNo;
    /** 本行锁定的笼位 ID（订购 → 笼位预定）；未选笼位时为 null */
    private Long targetAnimalCageId;
    /** 笼位坐标快照（对象形式）：校区/区域/楼层/房间/笼架/坐标 */
    private Object targetCageLocation;
    /** 笼位坐标的人读串，如「浦东 / A101 / 架3 (4,5)」 */
    private String targetCageLabel;
}
