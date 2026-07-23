package com.example.demo.modules.accessrule.service;

/**
 * 扫码进出后门禁规则与大华权限派发结果。
 */
public enum AccessRuleDispatchResult {
    /** 全局开关关闭：进入时不执行大华门禁规则下发 */
    SCAN_LINKAGE_ENTER_DISABLED,
    /** 全局开关关闭：离开时不执行大华门禁规则回收 */
    SCAN_LINKAGE_EXIT_DISABLED,
    /** 无启用规则命中 */
    NO_RULE,
    /** 命中规则但无通道/门组可下发 */
    MATCHED_NO_PRIVILEGE,
    /** 规则需要下发但 twin_card_mapping 无映射 */
    NO_MAPPING,
    /** 规则需要下发但 twin_card_mapping 无大华人员编码 */
    NO_PERSON_CODE,
    /** 大华接口成功 */
    BATCH_OK,
    /** 大华删除接口成功 */
    DELETE_OK,
    /** 大华接口失败或异常 */
    BATCH_FAILED,
    /** 大华删除接口失败或异常 */
    DELETE_FAILED
}
