package com.example.demo.modules.ai.bootstrap;

import java.util.Map;

/**
 * AI 对话文案的配置仓储（定义表 {@code sys_system_config_def} + 运行值表 {@code sys_system_config}）。
 *
 * <p>抽出这层只为让 {@link AiDrawerCopySeed} 可单测（见 {@code AiDrawerCopySeedTest} 的假仓储）。
 *
 * <p><b>只按传入的 key 逐键 upsert，绝不整模块覆盖</b> —— {@code module='ai'} 下还住着
 * {@code ai.prompt.*} 那些提示词键，整包写会把管理员改过的提示词抹掉。
 */
public interface AiCopyConfigStore {

    /** upsert 一条配置定义；返回 true = 新插入，false = 更新了已有行。 */
    boolean upsertDef(String module, String configKey, String labelZh, String description, String defaultValue);

    /** upsert 一条运行值；返回 true = 新插入，false = 更新了已有行。 */
    boolean upsertValue(String module, String configKey, String value);

    /**
     * 读一个模块下**所有**运行值：键 → 值。只含库里有行的键（没配的键不出现，由调用方回落默认值）。
     *
     * <p>返回的是整个模块的值，**调用方必须只挑自己关心的键** —— {@code module='ai'} 下还住着
     * {@code ai.prompt.*} 等别的键，整包往外发会把它们泄给界面。
     */
    Map<String, String> readValues(String module);
}
