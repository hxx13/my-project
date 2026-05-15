package com.example.demo.modules.policy;

/**
 * 业务域常量：须与 DB {@code biz_capability_policy.biz_domain}、通知 {@code biz_type}、收件箱 {@code kind} 一致。
 */
public final class BizDomains {
    private BizDomains() {
    }

    public static final String REPAIR = "REPAIR";
    public static final String PURCHASE = "PURCHASE";
    /** 物资领用（申请 / 出库处理队列） */
    public static final String SUPPLIES_CLAIM = "SUPPLIES_CLAIM";
    /** 物资后台（分类、库存、管理员出库接口） */
    public static final String SUPPLIES_ADMIN = "SUPPLIES_ADMIN";
}
