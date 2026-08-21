package com.example.demo.modules.twin.dashboard.support;

/**
 * C-T2 / T2-1：{@code enter_success_count} 语义探针结论（静态 + 运行时口径对齐）。
 *
 * <p>历史问题：物理列记录「已成功进入次数」（{@code incrementEnterSuccess}），
 * 但若干 SELECT 用同名子查询覆盖为「同人同规则违规条数」，
 * 而 {@code selectByCageViolationId} 用 {@code SELECT *} 未覆盖 —— 两条路径口径相反。
 *
 * <p><b>定论</b>：保留物理列语义（进入次数），去掉子查询别名覆盖。
 * 「相关违规条数」若日后需要，应使用独立别名（如 {@code related_violation_count}），不得复用本列名。
 * 扫码端解禁次数管控与管理端「进入计数」均依赖物理列。
 */
public final class EnterSuccessCountSemantics {

    public static final String PHYSICAL_MEANING = "successful_enter_count";
    public static final String FORBIDDEN_ALIAS_OVERLAY = "related_violation_count_as_enter_success_count";

    private EnterSuccessCountSemantics() {
    }

    public static boolean subqueryMustNotAliasAsEnterSuccessCount() {
        return true;
    }
}
