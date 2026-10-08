package com.example.demo.modules.ai.capability;

import com.example.demo.modules.auth.entity.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Predicate;

/**
 * 能力表的 P0 实现：**默认拒绝（fail-closed）**。
 *
 * 只有显式注册过的能力码才会被放行 —— 没注册一律拒。这样即使某个工具忘了配能力、
 * 或能力码写错，结果也是「用不了」而不是「谁都能用」。
 *
 * 用 Map 而不是角色的枚举比较，是为了让「同一件事只判一次」：
 * 加一个业务域时在这里注册该域需要的能力码（可扩展点 E3，只动这张表）。
 */
@Component
public class DefaultAiCapabilityGate implements AiCapabilityGate {

    private static final Logger log = LoggerFactory.getLogger(DefaultAiCapabilityGate.class);

    private final Map<String, Predicate<User>> registry = new LinkedHashMap<>();

    /** 注册一个能力码。判定为纯函数，不依赖外部状态。由 {@link AiCapabilityBootstrap} 在启动时调用。 */
    public void register(String code, Predicate<User> allowed) {
        registry.put(code, allowed);
    }

    @Override
    public String check(User actor, String capability) {
        if (actor == null) {
            return "未识别到操作人";
        }
        Predicate<User> allowed = registry.get(capability);
        if (allowed == null) {
            // fail-closed：未注册 = 不放行。这条日志是「有人用了还没配好的能力」的信号。
            log.warn("[ai-gate] 拒绝未注册的能力码: {} (user={})", capability, actor.getId());
            return "能力未注册： " + capability;
        }
        return allowed.test(actor) ? null : "权限不足：" + capability;
    }

    /** 测试与后续包扩展开口。 */
    Map<String, Predicate<User>> registry() {
        return registry;
    }
}
