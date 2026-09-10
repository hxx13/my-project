package com.example.demo.modules.referencedata.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class RefCartView {
    private Long id;
    private String groupId;
    private Long refDataId;
    private Long aupRecordId;
    private Object specSelections;
    private Integer quantity;
    /** 该物品是否开启了价格 */
    private Boolean priceEnabled;
    /** 单价（元）；未开启价格或未配价时为 null */
    private BigDecimal unitPrice;
    /** 小计 = unitPrice × quantity；受价格开关控制 */
    private BigDecimal lineAmount;
    /** 领用方式/房间：房间节点 id */
    private String pickupRoomId;
    /** 领用方式/房间：房间全路径名快照 */
    private String pickupRoomName;
    /** 领用人账号 id；空=下单人本人 */
    private String collectorId;
    /** 领用人显示名快照 */
    private String collectorName;
    private String remark;
    private String packageStatus;
    private String packageRemark;
    private String addedBy;
    /** 加购人展示名（人员库/账号名；缺省时与 addedBy 相同） */
    private String addedByName;
    /** 参考数据展示名（fieldData.title 等），便于购物车刷新后仍可读 */
    private String refDataLabel;
    private LocalDateTime addedAt;
}
