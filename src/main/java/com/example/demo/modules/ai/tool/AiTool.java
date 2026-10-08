package com.example.demo.modules.ai.tool;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.Objects;
import java.util.function.BiFunction;
import java.util.function.Function;

/**
 * 一个可被模型调用的工具。
 *
 * 命名原则：**工具是业务动词，接口是实现细节**。不叫 updateCardStatus，叫「免冻某人」——
 * 一个工具背后可以调多个接口。
 *
 * {@code capability} 走构造器强制校验：没有能力声明的工具**拒绝构造**。
 * 这是「工具漏判权限」风险的防线 —— 不给编译器（运行期）放过的机会。
 */
public record AiTool(
        String name,
        String description,
        String schemaJson,
        String capability,
        SideEffect sideEffect,
        AiToolExecutor executor,
        /**
         * 可选的**挂起前预解析**。返回值非空 = 这次不挂起，把返回值当作工具结果交回去
         * （通常带 {@code choices}，让用户先点选一个**必须由人决定、又不能只靠确认弹窗问清**的东西）；
         * 返回 null = 照常挂起等确认。
         *
         * <p>为什么必须有这个钩子：写工具的挂起**发生在执行体之前**（编排层先判
         * {@link #requiresConfirm()} 就拦下），所以执行体里「参数不全就先要一次澄清」的写法
         * 永远跑不到。三签的「以哪个身份签」正是这种参数 —— 它决定签的是归属地还是兽医，
         * 是权限与语义的一部分，不能由模型猜、也不该塞进 schema。
         *
         * <p>这就是编排层设计里那句「澄清与确认同源」：同一条挂起通道，先澄清、再确认。
         */
        BiFunction<AiToolContext, JsonNode, Object> resolveBeforeConfirm,
        /**
         * 可选的**确认详情**：挂起弹窗里「本次…」那一行的内容。缺省 = 参数原文 JSON。
         *
         * <p>为什么需要：参数里存的是稳定码（三签的 {@code "role":"VET"}），而确认是**人**在看的。
         * 让人点「确认执行」却只看到内部码，这道确认就退化成走形式 —— 而这一签可能真的把动物搬走。
         * 工具负责把码翻成人话（「以『兽医』身份签署（本次：同意）」）。
         *
         * <p>纯展示：它不参与任何判定，抛异常也只是回落到参数原文。
         */
        Function<JsonNode, String> confirmDetail) {

    /** 六参构造：既没有预解析、也没有自定义确认详情的工具（绝大多数）。 */
    public AiTool(String name, String description, String schemaJson, String capability,
                  SideEffect sideEffect, AiToolExecutor executor) {
        this(name, description, schemaJson, capability, sideEffect, executor, null, null);
    }

    public AiTool {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("工具名不能为空");
        }
        if (capability == null || capability.isBlank()) {
            throw new IllegalArgumentException("工具 " + name + " 未声明 capability，权限判定无依据");
        }
        Objects.requireNonNull(sideEffect, "工具 " + name + " 未声明副作用等级");
        Objects.requireNonNull(executor, "工具 " + name + " 没有执行体");
    }

    /**
     * 挂起确认弹窗里「本次…」那一行。缺省（或钩子出错）= 参数原文 JSON。
     *
     * <p>展示层，**绝不允许**因它抛异常而中断确认流程：这里吞掉异常回落到原文。
     */
    public String confirmDetailOf(JsonNode args) {
        String fallback = "本次参数：" + (args == null ? "{}" : args);
        if (confirmDetail == null) {
            return fallback;
        }
        try {
            String s = confirmDetail.apply(args);
            return s == null || s.isBlank() ? fallback : s;
        } catch (RuntimeException e) {
            return fallback;
        }
    }

    public boolean requiresConfirm() {
        return sideEffect.requiresConfirm();
    }

    /** 有没有挂起前预解析。没有就走原来的「直接挂起等确认」，零额外开销。 */
    public boolean hasPreConfirmResolve() {
        return resolveBeforeConfirm != null;
    }

    /**
     * 跑一次预解析。返回 null = 照常挂起。
     *
     * <p>钩子自己抛异常时**不**把它当挂起：宁可挂起让用户确认，也别把一次写操作
     * 因为一个「询问参数」的钩子出错而静默跳过（那会让确认流程看起来正常、实则什么都没问）。
     */
    public Object resolveBeforeConfirmOrNull(AiToolContext ctx, JsonNode args) {
        if (resolveBeforeConfirm == null) {
            return null;
        }
        try {
            return resolveBeforeConfirm.apply(ctx, args);
        } catch (RuntimeException e) {
            return null;
        }
    }

    /**
     * 挂起确认时**给人看**的动作短语 —— 取 description 的首句。
     *
     * <p>不能拿整个 description 当确认问句：它是**写给模型的**，后面常跟「不要自己选」
     * 「不要在正文里说已经办好了」这类指令 —— 那是给模型看的，原样搬到确认弹窗上，
     * 用户看到的就是一段在跟他讲规矩的话。2026-10-08 真机就这么露出来了。
     * 而首句通常正好是动作本身（「通过一张物资申领单。」）。
     */
    public String confirmPhrase() {
        if (description == null || description.isBlank()) {
            return name;
        }
        String flat = description.replaceAll("\\s+", " ").strip();
        int end = flat.indexOf('。');
        return end > 0 ? flat.substring(0, end + 1) : flat;
    }
}
