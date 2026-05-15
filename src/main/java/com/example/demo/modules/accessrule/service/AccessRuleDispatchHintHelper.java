package com.example.demo.modules.accessrule.service;

/**
 * 门禁规则与大华联动结果的人类可读提示（Web 扫码、审核离开、clean-exit 等共用）。
 * 实际是否下发/回收由 {@link AccessRuleDispatchService} 与 {@code twin_access_rule_scan_config} 全局开关共同决定。
 */
public final class AccessRuleDispatchHintHelper {

    private AccessRuleDispatchHintHelper() {
    }

    /**
     * @param accessType 1=进入 2=离开（仅影响部分失败类提示的措辞）
     * @return 无提示时返回 {@code null}
     */
    public static String humanHint(AccessRuleDispatchResult dispatchResult, int accessType) {
        if (dispatchResult == null) {
            return null;
        }
        return switch (dispatchResult) {
            case NO_MAPPING, NO_PERSON_CODE -> "门禁规则已命中，但该人员缺少大华映射信息";
            case BATCH_FAILED, DELETE_FAILED ->
                    accessType == 1 ? "门禁权限下发失败，请联系管理员" : "门禁权限删除失败，请联系管理员";
            case BATCH_OK -> "门禁权限下发成功";
            case DELETE_OK -> "门禁权限删除成功";
            case NO_RULE -> "未命中门禁规则，已按普通流程处理";
            case MATCHED_NO_PRIVILEGE -> "已命中规则，但规则未配置可下发的通道/门组";
            case SCAN_LINKAGE_ENTER_DISABLED -> "全局已关闭：进入时不执行大华门禁权限下发";
            case SCAN_LINKAGE_EXIT_DISABLED -> "全局已关闭：离开时不执行大华门禁权限回收";
        };
    }
}
