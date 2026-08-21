package com.example.demo.modules.twin.obligation.rule;

import java.util.Collections;
import java.util.Map;

/**
 * 期 5 · 可执行产生规则。描述信息见 {@link ProductionRuleDescriptor}；
 * 执行通过 {@link #execute(ProductionContext)} 收编到注册表。
 */
public interface ProductionRule {

    String code();

    String label();

    String sourceType();

    default ProductionRuleDescriptor descriptor() {
        return new ProductionRuleDescriptor(code(), label(), sourceType());
    }

    ProductionResult execute(ProductionContext context);

    record ProductionContext(String triggeredBy, Map<String, Object> params) {
        public ProductionContext(String triggeredBy) {
            this(triggeredBy, Collections.emptyMap());
        }

        public String param(String key) {
            if (params == null || key == null) {
                return null;
            }
            Object v = params.get(key);
            return v == null ? null : String.valueOf(v);
        }
    }

    record ProductionResult(boolean ok, String message, Map<String, Object> details) {
        public static ProductionResult success(String message) {
            return new ProductionResult(true, message, Map.of());
        }

        public static ProductionResult success(String message, Map<String, Object> details) {
            return new ProductionResult(true, message, details == null ? Map.of() : details);
        }

        public static ProductionResult failed(String message) {
            return new ProductionResult(false, message, Map.of());
        }
    }
}
