package com.example.demo.modules.twin.card.support;

import com.example.demo.modules.twin.common.service.TwinAutomationLogService;

/**
 * 豁免状态变更来源上下文（不可变值对象）。
 * <p>豁免的授予/收回记账已下沉到 {@code TwinCardMappingService} 状态变更点，
 * 所有调用方必须通过本类静态工厂声明变更来源（渠道码 + 操作人 + 关联单号），
 * 由变更点统一写 {@code EXEMPT_GRANTED} / {@code EXEMPT_REVOKED} 台账。</p>
 * <p>渠道码全部引用 {@link TwinAutomationLogService} 常量，避免双份字符串字面量。</p>
 */
public final class ExemptChangeContext {

    /** 触发方式：USER / TIMER / SYSTEM */
    private final String triggerType;
    /** 渠道码（trigger_reason，库存英文，展示时映射中文） */
    private final String reasonCode;
    /** 操作人用户 ID（人工渠道时有值） */
    private final String operatorUserId;
    /** 关联单据 ID（如延迟申请单号），无则 null */
    private final String relatedId;
    /** 客户端提示（如管理台传入的 client 标识），无则 null */
    private final String clientHint;
    /** 调用方附加说明（并入台账 detail 尾部，如「延迟选项=…」），无则 null */
    private final String extraDetail;

    private ExemptChangeContext(
            String triggerType, String reasonCode,
            String operatorUserId, String relatedId, String clientHint, String extraDetail) {
        this.triggerType = triggerType;
        this.reasonCode = reasonCode;
        this.operatorUserId = operatorUserId;
        this.relatedId = relatedId;
        this.clientHint = clientHint;
        this.extraDetail = extraDetail;
    }

    public String getTriggerType() {
        return triggerType;
    }

    public String getReasonCode() {
        return reasonCode;
    }

    public String getOperatorUserId() {
        return operatorUserId;
    }

    public String getRelatedId() {
        return relatedId;
    }

    public String getClientHint() {
        return clientHint;
    }

    public String getExtraDetail() {
        return extraDetail;
    }

    /** 返回携带附加说明的新实例（本类不可变），供调用方补充渠道细节（如「延迟选项=…」）。 */
    public ExemptChangeContext withExtraDetail(String extraDetail) {
        return new ExemptChangeContext(triggerType, reasonCode, operatorUserId, relatedId, clientHint, extraDetail);
    }

    /** 管理员在映射管理台手动设置/收回豁免 */
    public static ExemptChangeContext manualAdmin(String operatorUserId, String clientHint) {
        return new ExemptChangeContext(
                TwinAutomationLogService.TRIGGER_USER,
                TwinAutomationLogService.TRIGGER_MANUAL_ADMIN,
                operatorUserId, null, clientHint, null);
    }

    /**
     * 延迟申请授予豁免。
     *
     * @param source         APPROVED=审核通过；DIRECT=免审直批
     * @param reviewerUserId 审核人（直批时为申请人）
     * @param requestId      申请单号，直批无单据时为 null
     */
    public static ExemptChangeContext scanDelay(String source, String reviewerUserId, Long requestId) {
        String reasonCode = "APPROVED".equalsIgnoreCase(source)
                ? TwinAutomationLogService.TRIGGER_SCAN_DELAY_APPROVED
                : TwinAutomationLogService.TRIGGER_SCAN_DELAY_DIRECT;
        return new ExemptChangeContext(
                TwinAutomationLogService.TRIGGER_USER,
                reasonCode,
                reviewerUserId,
                requestId != null ? String.valueOf(requestId) : null,
                null, null);
    }

    /** 长期保管卡登记授予豁免 */
    public static ExemptChangeContext keepCard() {
        return new ExemptChangeContext(
                TwinAutomationLogService.TRIGGER_USER,
                TwinAutomationLogService.TRIGGER_KEEP_CARD_GRANT,
                null, null, null, null);
    }

    /** 扫码离开联动自动收回豁免 */
    public static ExemptChangeContext scanExit() {
        return new ExemptChangeContext(
                TwinAutomationLogService.TRIGGER_USER,
                TwinAutomationLogService.TRIGGER_SCAN_EXIT_REVOKE,
                null, null, null, null);
    }

    /** 豁免时效到期，定时自动收回 */
    public static ExemptChangeContext expireTimer() {
        return new ExemptChangeContext(
                TwinAutomationLogService.TRIGGER_TIMER,
                TwinAutomationLogService.TRIGGER_EXEMPT_EXPIRE_TIMER,
                null, null, null, null);
    }

    /**
     * 豁免次数耗尽自动收回。
     *
     * @param byTimer true=定时兜底跑批发现；false=扫码进入递增次数时发现
     */
    public static ExemptChangeContext countExhausted(boolean byTimer) {
        return new ExemptChangeContext(
                byTimer ? TwinAutomationLogService.TRIGGER_TIMER : TwinAutomationLogService.TRIGGER_USER,
                TwinAutomationLogService.TRIGGER_EXEMPT_COUNT_EXHAUSTED,
                null, null, null, null);
    }

    /** 每日豁免回收定时兜底收回 */
    public static ExemptChangeContext dailyResetFallback() {
        return new ExemptChangeContext(
                TwinAutomationLogService.TRIGGER_TIMER,
                TwinAutomationLogService.TRIGGER_DAILY_EXEMPT_RESET_FALLBACK,
                null, null, null, null);
    }

    /** 首次冻结结束后清空全员当日豁免 */
    public static ExemptChangeContext firstFreezeClear() {
        return new ExemptChangeContext(
                TwinAutomationLogService.TRIGGER_TIMER,
                TwinAutomationLogService.TRIGGER_FIRST_FREEZE_FINISHED_CLEAR_ALL_EXEMPT,
                null, null, null, null);
    }

    /** 事件溯源纠偏：核对流水后褫夺过期豁免 */
    public static ExemptChangeContext reconcile() {
        return new ExemptChangeContext(
                TwinAutomationLogService.TRIGGER_SYSTEM,
                TwinAutomationLogService.TRIGGER_EXEMPT_RECONCILE_REVOKE,
                null, null, null, null);
    }

    /** 开机洗刷过期豁免 */
    public static ExemptChangeContext startupReset() {
        return new ExemptChangeContext(
                TwinAutomationLogService.TRIGGER_SYSTEM,
                TwinAutomationLogService.TRIGGER_STARTUP_EXEMPT_RESET,
                null, null, null, null);
    }

    /** 解绑卡映射随行收回豁免 */
    public static ExemptChangeContext mappingDeleted(String operatorUserId) {
        return new ExemptChangeContext(
                TwinAutomationLogService.TRIGGER_USER,
                TwinAutomationLogService.TRIGGER_MAPPING_DELETED_REVOKE,
                operatorUserId, null, null, null);
    }

    /** 删除已批延迟申请撤回豁免 */
    public static ExemptChangeContext requestDeleted(String operatorUserId, Long requestId) {
        return new ExemptChangeContext(
                TwinAutomationLogService.TRIGGER_USER,
                TwinAutomationLogService.TRIGGER_SCAN_DELAY_REQUEST_DELETED,
                operatorUserId,
                requestId != null ? String.valueOf(requestId) : null,
                null, null);
    }
}
