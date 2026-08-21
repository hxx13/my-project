package com.example.demo.modules.twin.dashboard.support;

/**
 * T2-5 · {@code showNoticeEveryScan} 契约归属（单一真源说明）。
 *
 * <h2>决策（C-T2 定稿）</h2>
 * <ul>
 *   <li><b>存储与下发：服务端</b>——字段写在违规行 / 规则 / 公告全局配置 / 未绑卡配置上，
 *       扫码 payload 原样透传布尔值。</li>
 *   <li><b>展示频次决策：客户端</b>——是否「每次扫码自动展开」由扫码端根据该布尔值实现：
 *       {@code true} 时不写 session 已读；{@code false} 时关闭后写入 sessionStorage，
 *       同会话内不再自动展开。服务端<strong>不</strong>据此拦截扫码或改写禁入状态。</li>
 *   <li><b>跨会话抑制：服务端 auto-suppress</b>——用户点「不再自动弹出」走独立 API，
 *       与本字段正交；本字段只管「同会话默认展开策略」。</li>
 * </ul>
 *
 * <p>因此：后端「只透传不参与决策」是有意契约，不是遗漏。勿在 execute/禁入链路
 * 用本字段做分支。
 */
public final class ShowNoticeEveryScanContract {

    /** 默认：每次扫码自动展开（与历史管理端默认一致） */
    public static final boolean DEFAULT = true;

    private ShowNoticeEveryScanContract() {
    }

    /** 规范化可空布尔；null → {@link #DEFAULT} */
    public static boolean resolve(Boolean raw) {
        return raw == null ? DEFAULT : raw;
    }
}
