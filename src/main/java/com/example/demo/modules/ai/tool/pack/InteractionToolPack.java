package com.example.demo.modules.ai.tool.pack;

import com.example.demo.modules.ai.tool.AiChoices;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.AiView;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.auth.entity.User;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

/**
 * **向用户提问**的常驻工具包 —— 交互层的「通道①」。
 *
 * <h2>它解决什么</h2>
 * 工具返回的候选选项（`choices` / `questions`）承载两件**形状相同、语义相反**的事：
 * 「我查到几个候选，帮你收窄」与「不问就办不成」。代码分不出来，于是过去一律弹 ——
 * 实测用户被追着问（问一句「有哪些断货物资」，答完还追一道「挑一件」）。
 *
 * <p>2026-10-11 起编排层**默认不弹**工具候选；模型想主动问一句时，改用这个工具。
 * 好处是**问不问由模型定**（它看得到对话上下文），而不是由看不见上下文的工具定。
 *
 * <h2>选项是模型自己写的，不是查出来的</h2>
 * 这类选项**不绑定任何实体值**（`value` 就等于 `label`）：点下去等于用户说了那句话，
 * 模型再自己去查真实数据。所以它可以自由生成、可以编 —— 编错了只是那句话没人要，
 * 而工具查出来的候选编错了会让写操作打在一个不存在的对象上。两者**不是一回事**（设计文档 §9.4）。
 *
 * <h2>刻意不做的事</h2>
 * <ul>
 *   <li>**不做确认**：写操作的二次确认是编排层的硬拦、模型绕不过；搬到这里就变成
 *       「模型申请才确认」——模型不申请即可直接执行写操作，那是安全降级。</li>
 *   <li>**不做真值校验**：见上，这一条通道的选项不驱动执行。</li>
 * </ul>
 *
 * <p>常驻：因为包是「能力过滤后全发」，本包天然每轮都在；`views()` 显式覆盖两个视角，
 * 保证学生侧也有（只读默认只给教职工）。
 */
@Component
public class InteractionToolPack implements AiToolPack {

    /** 提问能力码：不改变任何状态、也不泄露数据，**人人可用**（fail-closed 的闸要求显式声明）。 */
    public static final String CAP_ASK = "ai.interaction.ask";

    @Override
    public String packKey() {
        return "interaction";
    }

    @Override
    public String displayName() {
        return "向用户提问";
    }

    @Override
    public Set<AiView> views() {
        return Set.of(AiView.STAFF, AiView.STUDENT);
    }

    @Override
    public String defaultPrompt() {
        return """
                ## 什么时候该问用户
                只有「**他挑一个你才能继续办事**」时才问。用户只是在了解情况（有哪些、多少、什么情况）时，
                直接把答案给全 —— **不要顺手抛一道选择题**，那正是最招人烦的用法。

                - 需要用户拍板才能往下走 → 调 `askUser`，把选项交出去，**正文里不要再复述一遍选项**。
                - **不要写只有一个选项的题**：那不是选择，直接按它办就是了。
                - 选项是你替用户想的「他可能想说什么」，所以要**写得像人话**，每条带一句备注说清选它会怎样。
                - 你并不确定用户要什么时，宁可问一个开放问题，也不要硬凑几个选项让他挑。
                """;
    }

    @Override
    public Map<String, Predicate<User>> capabilities() {
        return Map.of(CAP_ASK, user -> true);
    }

    @Override
    public List<AiTool> tools() {
        return List.of(askUser());
    }

    private AiTool askUser() {
        return new AiTool(
                "askUser",
                "问用户一道选择题：给几个选项、每条带一句备注，让他点。**只在他挑一个你才能继续办事时用**；"
                        + "只是了解情况就直接答完，别用这个工具。",
                """
                        {"type":"object","properties":{
                          "question":{"type":"string","description":"要问的问题，一句话，用用户的口吻"},
                          "options":{"type":"array","minItems":2,"items":{"type":"object","properties":{
                              "label":{"type":"string","description":"选项文字（用户看到的）"},
                              "note":{"type":"string","description":"一句备注：选它会怎样"}},
                            "required":["label"]},
                            "description":"2~6 个选项。**只有一个选项时不要调这个工具**"},
                          "multiSelect":{"type":"boolean","description":"能不能多选，默认单选"}
                        },"required":["question","options"]}
                        """,
                CAP_ASK,
                // 纯读：它不改变任何状态，只是把一道题交出去
                SideEffect.READ,
                (ctx, args) -> doAsk(args));
    }

    private Object doAsk(JsonNode args) {
        String question = text(args, "question");
        JsonNode raw = args.path("options");
        if (question.isBlank() || !raw.isArray() || raw.size() < 2) {
            // 少于两个选项就不是选择题 —— 让模型自己在正文里把话说完，别硬凑
            return Map.of("ok", false,
                    "reason", "question 要有，options 至少给 2 个。只有一个选项时不要用它 —— 那不是选择，直接按它办。");
        }

        List<Map<String, Object>> options = new ArrayList<>();
        for (JsonNode node : raw) {
            String label = text(node, "label");
            if (label.isBlank()) {
                continue;
            }
            // **value 就是 label 本身**：这一条通道的选项不绑实体值，点下去等于用户说了那句话，
            // 模型再自己去查真实数据（所以不需要真值校验）。
            Map<String, Object> opt = AiChoices.option(label, label);
            String note = text(node, "note");
            if (!note.isEmpty()) {
                opt.put("note", note);
            }
            options.add(opt);
        }
        if (options.size() < 2) {
            return Map.of("ok", false, "reason", "有效选项少于 2 个，把 label 写上。");
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        // 标 ASK_REQUIRED：这是模型**主动**要问的，编排层照它弹（默认不弹的是工具顺手带的候选）
        out.putAll(args.path("multiSelect").asBoolean(false)
                ? AiChoices.requiredMulti(question, options)
                : AiChoices.requiredSingle(question, options));
        out.put("note", "问题已经交给用户点，**正文里不要再把选项复述一遍**，也别等他说别的才动。");
        return out;
    }

    private static String text(JsonNode node, String field) {
        JsonNode v = node.path(field);
        return v.isMissingNode() || v.isNull() ? "" : v.asText("").trim();
    }
}
