package com.example.demo.modules.twin.obligation.disposition;

import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 期 3 · 处置策略注册表。新增策略 = 实现 {@link DispositionStrategy} 并注册为 Spring bean。
 */
@Component
public class DispositionStrategyRegistry {

    private final Map<String, DispositionStrategy> byType = new LinkedHashMap<>();

    public DispositionStrategyRegistry(List<DispositionStrategy> strategies) {
        if (strategies != null) {
            for (DispositionStrategy s : strategies) {
                if (s == null || s.type() == null || s.type().isBlank()) {
                    continue;
                }
                byType.put(s.type().trim().toUpperCase(), s);
            }
        }
    }

    public Optional<DispositionStrategy> find(String type) {
        if (type == null || type.isBlank()) {
            return Optional.empty();
        }
        return Optional.ofNullable(byType.get(type.trim().toUpperCase()));
    }

    public DispositionStrategy require(String type) {
        return find(type).orElseThrow(() ->
                new IllegalArgumentException("未注册的处置策略: " + type));
    }

    public Collection<DispositionStrategy> all() {
        return List.copyOf(byType.values());
    }

    public boolean verify(String dispositionType, String configJson, String answerRaw) {
        return find(dispositionType)
                .map(s -> s.verify(configJson, answerRaw))
                .orElse(false);
    }
}
