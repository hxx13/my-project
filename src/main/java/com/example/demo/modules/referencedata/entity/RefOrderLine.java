package com.example.demo.modules.referencedata.entity;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class RefOrderLine {
    private Long id;
    private Long orderId;
    private Long refDataId;
    /** 供应商（ARO 导入的结构化品名；本地自建行靠 hierarchy_chain） */
    private String supplierName;
    /** 品系（ARO 导入的结构化品名） */
    private String strainName;
    /** 规格（ARO 导入的结构化品名） */
    private String specName;
    private String specSelections;
    private String hierarchyChain;
    private Integer quantity;
    /** 下单时单价快照（元）；物品未开启价格时为 null */
    private BigDecimal unitPrice;
    /** 实际到货日期（ARO 导入） */
    private String arrivalDate;
    /** 领用方式/房间：房间节点 id */
    private String pickupRoomId;
    /** 领用方式/房间：房间全路径名快照 */
    private String pickupRoomName;
    /** 领用人账号 id；未指定时为空表示下单人本人 */
    private String collectorId;
    /** 领用人显示名快照 */
    private String collectorName;
    private String lineRemark;
    private String addedBy;
    /** 行级 AUP 合规归因 → aup_record.id */
    private Long aupRecordId;
    /** 本行锁定的笼位 ID（自购物车快照；订购即已预定到该笼位） */
    private Long targetAnimalCageId;
    /** 笼位坐标快照（JSON）：校区/区域/楼层/房间/笼架/坐标。快照而非实时 join，笼位后搬动不改历史单 */
    private String targetCageLocation;
}
