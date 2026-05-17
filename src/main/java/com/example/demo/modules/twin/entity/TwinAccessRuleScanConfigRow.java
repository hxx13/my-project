package com.example.demo.modules.twin.entity;

import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
public class TwinAccessRuleScanConfigRow {
    private Integer id;
    /** 1=进入扫码时执行门禁规则下发 */
    private Integer enterDispatchEnabled;
    /** 1=离开扫码时执行门禁规则回收 */
    private Integer exitDispatchEnabled;
    /** 1=进入扫码时解冻物理卡 */
    private Integer enterUnfreezeEnabled;
    /** 1=离开扫码/自动签退时冻结物理卡 */
    private Integer exitFreezeEnabled;
    private String updatedBy;
    private LocalDateTime updatedAt;
}
