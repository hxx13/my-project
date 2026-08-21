package com.example.demo.modules.twin.obligation.disposition;

import java.util.Map;

/**
 * 期 3 · 处置策略三件套契约（配置 schema + 服务端校验）。
 * 执行组件在前端/各渠道；服务端只认注册表中的校验器。
 */
public interface DispositionStrategy {

    /** 策略编码，写入 twin_obligation.disposition_type */
    String type();

    /** 是否需要 interactive 渠道才能完成处置 */
    boolean requiresInteraction();

    /**
     * 管理端渲染用的轻量 schema 描述（字段名 → 提示）。
     * 完整 JSON Schema 可后续替换，本期垂直切片用 Map 即可。
     */
    Map<String, String> configSchema();

    /**
     * 校验答案是否通过。
     *
     * @param configJson 策略配置（obligation.disposition_config_json）
     * @param answerRaw  用户提交原文
     */
    boolean verify(String configJson, String answerRaw);
}
