package com.example.demo.modules.referencedata.entity;

import lombok.Data;

import java.time.LocalDate;
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
    /** 领用方式/房间：房间节点 id（到房间级，不具体到笼架） */
    private String pickupRoomId;
    /** 领用方式/房间：房间全路径名快照，供展示与导出 */
    private String pickupRoomName;
    /** 领用人账号 id；默认下单人本人 */
    private String collectorId;
    /** 领用人显示名快照 */
    private String collectorName;
    /**
     * 编辑在途标记：非空表示该行是「编辑某张待处理订单」时回填的，
     * 用于保存/放弃时精确定位，避免把用户其它购物车内容误删或误并。
     */
    private Long editingOrderId;
    private String remark;
    /** DRAFT | READY：实验员订单包状态（非正式单） */
    private String packageStatus;
    /** 实验员提交订单包时的统一备注 */
    private String packageRemark;
    /** 本行锁定的笼位 ID（订购 → 笼位预定，见 cage_order_reservation） */
    private Long targetAnimalCageId;
    /**
     * 领用方式：FARM 饲养（预定笼位，房间随笼位带出）| TAKE 取走（不占笼位也不选房间）。
     *
     * <p>取走的 pickupRoomId / targetAnimalCageId 都是空，光看「房间为空」区分不了它与
     * 「快照丢了」，所以领用方式必须显式落一列，审核页与导出才能如实显示。
     */
    private String pickupMode;
    /** 目标到货周期（预计到货日）。NULL = 未选（旧客户端），按当前周期处理 */
    private LocalDate deliveryCycle;
    private String addedBy;
    private LocalDateTime addedAt;
}
