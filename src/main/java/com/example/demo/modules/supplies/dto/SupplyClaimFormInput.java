package com.example.demo.modules.supplies.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * 领用单渲染入参：把订单 + 明细 + 签名合成一份扁平数据。
 *
 * <p>渲染器不查库、不做取值判断，只按行往模板格子里写 —— 这样版式逻辑能脱离数据库单测。
 */
@Data
public class SupplyClaimFormInput {

    /** 单号：出库日期 + 领用人姓名 + 当天第几单，如 {@code 20260923-位亚磊-1}。印在标题下面。 */
    private String docNo;
    /** 领用人员（提交时冻结的显示名）。 */
    private String applicantName;
    /** 领用楼层：出库时管理员手填，没填就留空手写。 */
    private String claimFloor;
    /** 填单日期（提交日，{@code 2026-09-23}）。 */
    private String fillDate;
    /**
     * 实际领用日期（出库日，{@code 2026-09-23}）。
     *
     * <p>整单就一个出库时刻，但单子上每行都有这一列 —— 每行都印同一个日期。
     */
    private String issueDate;
    /** 明细行；渲染时按 {@code max(10, 行数)} 决定打印几行。 */
    private List<Row> rows = new ArrayList<>();
    /** 领用人员电子签名（PNG dataUrl）；没提交过就是空，那一栏留白。 */
    private String applicantSignature;
    /** 出库人电子签名（PNG dataUrl）；没提交过就是空。 */
    private String issuerSignature;

    @Data
    public static class Row {
        /** 物品名称。 */
        private String name;
        /** 型号 / 规格。 */
        private String spec;
        /** 领用数量（申请量）。 */
        private Integer qty;
        /** 实际出库量（实发量）。 */
        private Integer fulfilledQty;
        /** 备注。 */
        private String remark;
    }
}
