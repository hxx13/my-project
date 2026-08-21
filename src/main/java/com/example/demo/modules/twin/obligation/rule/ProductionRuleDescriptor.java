package com.example.demo.modules.twin.obligation.rule;

/**
 * 期 5 · 产生规则注册表条目。
 */
public record ProductionRuleDescriptor(
        String code,
        String label,
        String sourceType
) {
}
