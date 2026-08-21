package com.example.demo.modules.twin.obligation.rule;

import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 期 5 · 产生规则注册表（可执行）。
 * 滞留 / 笼位 / 手动经本表 execute；公告与未绑卡为懒同步占位。
 */
@Component
public class ProductionRuleRegistry {

    private final Map<String, ProductionRule> byCode = new LinkedHashMap<>();

    public ProductionRuleRegistry(List<ProductionRule> rules) {
        if (rules != null) {
            for (ProductionRule r : rules) {
                if (r == null || r.code() == null || r.code().isBlank()) {
                    continue;
                }
                byCode.put(r.code().trim().toUpperCase(), r);
            }
        }
    }

    public Optional<ProductionRule> find(String code) {
        if (code == null || code.isBlank()) {
            return Optional.empty();
        }
        return Optional.ofNullable(byCode.get(code.trim().toUpperCase()));
    }

    public ProductionRule require(String code) {
        return find(code).orElseThrow(() ->
                new IllegalArgumentException("未注册的产生规则: " + code));
    }

    public Collection<ProductionRuleDescriptor> all() {
        return byCode.values().stream().map(ProductionRule::descriptor).toList();
    }

    public ProductionRule.ProductionResult execute(String code, ProductionRule.ProductionContext context) {
        ProductionRule rule = require(code);
        ProductionRule.ProductionContext ctx = context != null
                ? context
                : new ProductionRule.ProductionContext("system");
        return rule.execute(ctx);
    }
}
