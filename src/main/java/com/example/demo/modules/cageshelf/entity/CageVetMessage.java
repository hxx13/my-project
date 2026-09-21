package com.example.demo.modules.cageshelf.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 兽医收件箱里的一条消息（cage_vet_message）：每次「通知兽医」触发形成一条，
 * 兽医点「已查看」后才写 {@link #readAt}（未读 = readAt 为空 → 网格上紫色描边）。
 *
 * <p>兽医的**指导意见不在这张表**：它落在 cage_info_value 的表单字段里
 * （`vet_advice` / `vet_advice_images`），这样归档时与表单内容一起归档。
 * 这张表只管「这条看过没」。
 */
@Data
public class CageVetMessage {

    private Long id;
    /** 来源告警行 id（cage_status_alert.id）；唯一键保证同一条告警只出一条消息 */
    private Long alertId;
    private Long animalCageId;
    private String statusCode;
    private LocalDateTime firedAt;
    /** NULL = 未读 */
    private LocalDateTime readAt;
    private String readBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    // ── 下面几个是读视图 join 出来的定位字段，不落库 ──

    /** 所属笼架（join cage_cell_index） */
    private Long shelveId;
    /** 所属房间（join cage_shelf_index） */
    private Long roomId;
    private String roomName;
    private String shelveName;
    /** 收件箱按 校区 → 楼层 → 房间 → 笼架 分组建树，名字一并带出来（省得前端再拉一遍区域树） */
    private String campusName;
    private String floorName;
    private Integer positionX;
    private Integer positionY;
    private String projectPiName;
    private String experimenterName;
    /** 笼位类型码（1 等待分配 / 2 空笼位 / 3 饲养中）——收件箱右侧「基本信息」用。
        不用 state_label：那一列全库都是空的，拿它做「笼位状态」等于永远空白 */
    private Integer cageTypeCode;
    /** 笼盒编号与 AUP 注册号：兽医看笼位时的基本身份信息 */
    private String cageBoxCode;
    private String aupNumber;
}
