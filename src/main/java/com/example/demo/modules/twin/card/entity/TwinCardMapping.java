package com.example.demo.modules.twin.card.entity;

import lombok.Getter;
import lombok.Setter;

/**
 * 孪生系统：物理卡片与人员身份映射防腐实体
 */
@Setter
@Getter
public class TwinCardMapping {

    // --- 物理表字段 ---
    private Integer id;
    private String cardNo;             // 物理卡号 (读卡器扫入)
    private String dahuaSeq;           // 大华门禁序号 (用于下发冻结/解冻)
    private String dahuaPersonCode;    // 大华人员编码 (用于权限下发/删除)
    private String aroUserId;          // ARO系统人员唯一ID (外键映射)
    private String cardStatus;         // 状态: NORMAL(正常), FROZEN(冻结)
    /** 1=豁免自动冻结（最终冻结步骤）；激活/签退联动仍正常执行，扫码时段按 freeze_exempt_room_ids 房间级放行 */
    private Integer freezeExemptFlag;
    /** 豁免授予日 yyyy-MM-dd，与 freeze_exempt_flag 联动 */
    private String freezeExemptGrantDate;
    /** 豁免授予时间戳（库 DATETIME） */
    private String exemptGrantedAt;
    /** 豁免到期时间 yyyy-MM-dd HH:mm:ss；到期后自动收回 flag */
    private String freezeExemptExpireAt;
    /** 豁免房间权限ID JSON数组 ["roomId1","roomId2"] */
    private String freezeExemptRoomIds;
    /** 豁免模式 TIME / COUNT / BOTH */
    private String freezeExemptMode;
    /** 次数限制上限（mode=COUNT或BOTH时有效） */
    private Integer freezeExemptMaxCount;
    /** 已使用次数 */
    private Integer freezeExemptUsedCount;
    private String lastModifiedTime;   // 最后修改时间戳

    // --- 视图聚合字段 (不存入当前表，通过 JOIN 获取，供前端大屏展示) ---
    private String userName;           // 拼装：人员姓名
    private String jobNumber;          // 拼装：工号
    private String projectGroupName;   // 拼装：课题组（aro_personnel）
    private String head;               // 拼装：头像URL（aro_personnel）

}