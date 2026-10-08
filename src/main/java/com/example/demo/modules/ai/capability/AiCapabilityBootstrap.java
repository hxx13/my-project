package com.example.demo.modules.ai.capability;

import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.ToolRegistry;
import com.example.demo.modules.auth.entity.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;
import java.util.function.Predicate;

/**
 * 把各工具包自带的 {@link AiToolPack#capabilities()} 注册进能力闸门。
 *
 * <p>这样「加一个业务域」只需加一个 Bean，能力码随之生效（E1 + E3）——
 * 不必去改闸门本体。
 *
 * <p>重复的能力码直接启动失败：同一个码有两种判定，说明有人在两处各写了一遍，
 * 那正是要防的分叉。
 */
@Component
@Order(127)
public class AiCapabilityBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AiCapabilityBootstrap.class);

    private final ToolRegistry toolRegistry;
    private final DefaultAiCapabilityGate gate;

    public AiCapabilityBootstrap(ToolRegistry toolRegistry, DefaultAiCapabilityGate gate) {
        this.toolRegistry = toolRegistry;
        this.gate = gate;
    }

    @Override
    public void run(ApplicationArguments args) {
        Map<String, String> owner = new HashMap<>();
        for (AiToolPack pack : toolRegistry.packs()) {
            for (Map.Entry<String, Predicate<User>> entry : pack.capabilities().entrySet()) {
                String code = entry.getKey();
                String previous = owner.putIfAbsent(code, pack.packKey());
                if (previous != null) {
                    throw new IllegalStateException(
                            "能力码 " + code + " 同时被包 " + previous + " 与 " + pack.packKey()
                                    + " 声明 —— 同一码两种判定必然分叉，必须合并到一处");
                }
                gate.register(code, entry.getValue());
            }
        }
        log.info("[ai-gate] 已注册 {} 个能力码（来自 {} 个工具包）", owner.size(), toolRegistry.packs().size());
    }
}
