package com.example.demo.modules.ai.tool;

/**
 * 对话的**视角** —— 工具包按它分发。
 *
 * <p>为什么要分层：同一个平台，教职工与学生能办的事完全不同（教职工有审批、门禁、环境监测；
 * 学生有的是自己的申领、笼架、培训）。**不是按角色等级能表达的**：学生账号的角色档可能是 STAFF 级
 * （见 {@code CageModeVisibilityService.isStudent} 的注释：三端一律按 {@code account_source} 二分），
 * 所以「谁在用」这件事在 AI 侧也只认这一个判据。
 *
 * <p>判据单点：{@code CageModeVisibilityService#isStudent(User)}（后端唯一实现），
 * 与前端 {@code isStudentAccount()} 同源。本枚举只是给工具包声明用的词汇。
 *
 * <p>**默认是 {@link #STAFF}**：没声明视角的包，学生一律看不见（fail-closed）——
 * 漏声明最多让某个包晚一点服务学生，而不是把教职工能力漏给学生。
 */
public enum AiView {
    /** 教职工视角（含管理员/超管）。 */
    STAFF,
    /** 学生视角。 */
    STUDENT;
}
