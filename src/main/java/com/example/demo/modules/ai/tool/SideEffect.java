package com.example.demo.modules.ai.tool;

/**
 * 工具副作用等级。决定「要不要人工确认」——详见接口摸排文档 §6.1。
 */
public enum SideEffect {

    /** A 纯读：无副作用。 */
    READ("纯读", false),

    /** B 幂等写：写库但不依赖外部，失败可安全重试。 */
    IDEMPOTENT_WRITE("幂等写", false),

    /** C 非幂等外部依赖：调外部硬件/系统，失败后状态可能不一致。 */
    EXTERNAL_WRITE("非幂等外部依赖", true),

    /** D 批量/长耗时：影响 N 个对象或耗时长。 */
    BULK("批量长耗时", true);

    private final String label;
    private final boolean requiresConfirm;

    SideEffect(String label, boolean requiresConfirm) {
        this.label = label;
        this.requiresConfirm = requiresConfirm;
    }

    public String label() {
        return label;
    }

    /** C / D 一律强制二次确认 —— 不因为「模型觉得明确了」而跳过。 */
    public boolean requiresConfirm() {
        return requiresConfirm;
    }
}
