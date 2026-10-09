package com.example.demo.modules.supplies.dto;

import lombok.Data;

/**
 * 单个领取人在某个时间窗口内的领用量（回答「谁领得多 / 谁最近在领」用）。
 *
 * <p>口径来自库存流水表（与库存审计页同一份），按 {@code applicant_user_id} 汇总；
 * 出库量取 {@code OUTBOUND} 的数量（本模块存正数）。名字由 Service 用同一套
 * {@code UserDisplayNameService} 补上 —— 别把内部账号 id 抛给用户看。
 */
@Data
public class SupplyApplicantConsumptionView {
    private String applicantUserId;
    /** 领取人显示名（由 Service 补齐） */
    private String applicantName;
    /** 窗口内涉及了几张领用单 */
    private Integer claimCount;
    /** 窗口内领走的总件数 */
    private Integer outboundQty;
    /** 窗口内最后一次领取时间（字符串，与页面展示格式一致） */
    private String lastAt;
}
