package com.example.demo.modules.referencedata.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 笼位预定 —— 动物订购把订单行锁定到一个 type2（已预约空笼盒）笼位上。
 *
 * <p>笼位状态本身不变（保持 type2），这张表才是「预定态」的真相源：
 * 谁、用哪份 AUP、锁了哪个笼位、要放什么、放多少。
 *
 * <p>竞态由 {@code active_cage_id} 上的唯一索引保证：status=LOCKED 时该列写入
 * animalCageId，释放/消耗时置 null。MySQL 唯一索引允许多个 NULL，所以
 * 「同一笼位只能有一条活跃预定」是数据库层面的约束，不依赖先查后插。
 */
@Data
public class CageOrderReservation {
    private Long id;
    private Long animalCageId;
    private Long activeCageId;
    private Long aupRecordId;
    private Long cartId;
    private Long orderId;
    /** 规格选项标识（模板名: 选项），用于「一笼一规格」判定 */
    private String specKey;
    private String strainName;
    private String sex;
    private Integer quantity;
    private String reserverId;
    private String reserverName;
    private String groupName;
    /** LOCKED=预定中 / CONSUMED=已转占用 / RELEASED=已释放 */
    private String status;
    private String releaseReason;
    /** 预定时写进笼位表单的 canonical→值（JSON），释放时按此精确撤销，避免抹掉笼位自己的历史值 */
    private String writtenJson;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
