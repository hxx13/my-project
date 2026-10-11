package com.example.demo.modules.ai.service;

import com.example.demo.modules.ai.entity.AiMessage;
import com.example.demo.modules.ai.entity.AiToolCallLog;
import com.example.demo.modules.ai.mapper.AiGatewayMapper;
import com.example.demo.modules.ai.mapper.AiMessageFeedbackMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 「这一轮到底办得好不好」—— 判据的行为那四路（设计文档 §5）。
 *
 * <h2>为什么以行为为主</h2>
 * 显式赞/踩样本太稀（大多数人不会点），拿它当主判据会让学习池饿死。行为信号不用求任何人 ——
 * 用户紧接着重说、点了确认、跑通了没报错，这些**留痕里本来就有**。
 *
 * <h2>五路信号，每路的判据都写在下面 {@link #signalsOfSession} 里</h2>
 * 认了 / 没听懂 / 点选 / 赞踩 / 弃聊。**「点选」用文案比对**（逐字等于上一轮给过的某个选项），
 * 不加协议字段 —— 见设计文档 §3.2 的取舍。
 *
 * <h2>取向：宁可漏报，不可误报</h2>
 * 每一条判据都写得**保守**：拿不准就当没发生。因为误报会直接污染学习池，
 * 而漏报只是这一轮不参与统计。
 */
@Service
public class AiTurnSignalService {

    /** 权重：先按设计文档 §5 的直觉给，真跑出数据再调。 */
    static final int W_ACK = 2;
    static final int W_MISUNDERSTOOD = -3;
    static final int W_PICKED = 1;
    static final int W_VOTE_UP = 2;
    static final int W_VOTE_DOWN = -3;
    /**
     * 弃聊**不参与计分**（用户 2026-10-11 定）。
     *
     * <p>原来给 −1，理由是「最后一条是用户说的、再无回应」。但实测这个判据分不出两种情况：
     * 用户**放弃**了，和用户**试了一下、最后决定不执行**。后者完全是正常收尾，不该当负面。
     * 分不出来的信号就不该计分 —— 留 −1 只会让「试完就走」的正常轮被当成负面丢掉。
     * 字段保留：留痕照记，将来有更好的判据可以重新启用。
     */
    static final int W_ABANDONED = 0;
    /**
     * **自定义回答**：上一轮抛过选项，用户**没用**，而是自己说了 —— 给最高正权重。
     *
     * <p>为什么它比「认了」还值钱：这一轮里同时有**用户自己的说法**和**他最终要办的事**，
     * 正是学习池要找的「说法 → 工具」原件。而「认了」只说明工具跑通了，不说明用户的说法是新的。
     */
    static final int W_CUSTOM_ANSWER = 3;

    /**
     * 一「轮」（一条用户消息 + 它引起的那些回复）的行为信号。
     *
     * @param acknowledged   认了：这一轮里**有工具真的执行成功且没报错**（模型确实办了事）
     * @param misunderstood  没听懂：这一轮**什么也没办成、也没问任何问题**，而且用户**紧接着又说话了**
     *                       —— 保守判据，见 {@link #signalsOfSession}
     * @param picked         点选：这句话**逐字等于**上一轮给过的某个选项
     * @param vote           {@code up} / {@code down} / 空
     * @param abandoned      弃聊：这是会话里最后一条用户消息，且此后没有任何助手回复
     */
    public record TurnSignals(
            Long sessionId,
            Long userMessageId,
            String userText,
            boolean acknowledged,
            boolean misunderstood,
            boolean picked,
            /** 自定义回答：上一轮抛过选项，用户没用、而是自己说了（见 {@link #W_CUSTOM_ANSWER}）。 */
            boolean customAnswer,
            /**
             * 这一轮**之前**给过的选项文案（可能是上一轮抛的，也可能是这一轮自己抛的）。
             *
             * <p>带出来是给**归类那一步**用的：光看「用户这句话等不等于某个选项」（字符串比对）
             * 分不清「他点了我们给的」和「他自己另说了一句意思差不多的话」—— 后者会把**我们自己写的措辞**
             * 当成用户的说法学进池子，然后再注入回去，绕成一个蠢环。所以要把原料交给模型去分辨。
             */
            Set<String> offeredOptions,
            String vote,
            boolean abandoned,
            /**
             * 这一轮**跑通了**的工具名（已执行且没报错）。
             *
             * <p>单独带出来是给**学习池的分析器**用：它要按「这句话对上哪条工具」计数。
             * 不复用它自己去读一遍留痕 —— 同一份「按会话切轮、按 messageId 分桶」的算法写两遍必然漂。
             */
            Set<String> okTools) {

        /** 汇成一个分。**权重是直觉值，不是定论** —— 等真实分布出来再调。 */
        public int score() {
            int s = 0;
            if (acknowledged) s += W_ACK;
            if (misunderstood) s += W_MISUNDERSTOOD;
            if (picked) s += W_PICKED;
            if (customAnswer) s += W_CUSTOM_ANSWER;
            if ("up".equals(vote)) s += W_VOTE_UP;
            if ("down".equals(vote)) s += W_VOTE_DOWN;
            // 弃聊**不计分**（W_ABANDONED = 0）—— 分不出「放弃」和「试完不执行」，见常量的说明。
            // 这里不写 `if (abandoned) s += W_ABANDONED;`：加 0 是噪声，留着更容易被人误以为它在起作用。
            return s;
        }
    }

    private final AiGatewayMapper gatewayMapper;
    private final AiMessageFeedbackMapper feedbackMapper;
    private final ObjectMapper objectMapper;

    public AiTurnSignalService(AiGatewayMapper gatewayMapper,
                               AiMessageFeedbackMapper feedbackMapper,
                               ObjectMapper objectMapper) {
        this.gatewayMapper = gatewayMapper;
        this.feedbackMapper = feedbackMapper;
        this.objectMapper = objectMapper;
    }

    /**
     * 把一段会话拆成「用户轮」，给每一轮算信号。
     *
     * <p>切分：每条 user 消息到**下一条 user 消息之前**算一轮（中间那些 assistant / tool 是它的结果）。
     */
    public List<TurnSignals> signalsOfSession(Long sessionId) {
        List<AiMessage> msgs = gatewayMapper.selectMessagesBySession(sessionId);
        if (msgs == null || msgs.isEmpty()) {
            return List.of();
        }

        // 调用留痕按 messageId 分桶（它挂在哪条 assistant 消息上）
        Map<Long, List<AiToolCallLog>> logsByMessage = new HashMap<>();
        List<AiToolCallLog> logs = gatewayMapper.selectToolCallsBySession(sessionId);
        if (logs != null) {
            for (AiToolCallLog l : logs) {
                if (l.getMessageId() != null) {
                    logsByMessage.computeIfAbsent(l.getMessageId(), k -> new ArrayList<>()).add(l);
                }
            }
        }

        // 赞/踩按 messageId（判据看**所有人**的票，不是只看某一个人的）
        Map<Long, String> votes = new HashMap<>();
        List<Map<String, Object>> voteRows = feedbackMapper.allVotesInSession(sessionId);
        if (voteRows != null) {
            for (Map<String, Object> r : voteRows) {
                Object mid = r.get("messageId");
                Object v = r.get("vote");
                if (mid != null && v != null) {
                    votes.put(longOf(mid), String.valueOf(v));
                }
            }
        }

        List<TurnSignals> out = new ArrayList<>();
        for (int i = 0; i < msgs.size(); i++) {
            AiMessage m = msgs.get(i);
            if (!"user".equals(m.getRole())) {
                continue;
            }

            // 这一轮的结果段：从下一条消息起，到下一条 user 之前
            List<AiMessage> span = new ArrayList<>();
            int j = i + 1;
            for (; j < msgs.size() && !"user".equals(msgs.get(j).getRole()); j++) {
                span.add(msgs.get(j));
            }
            boolean hasNextUser = j < msgs.size();

            // ① 认了：这一段里有工具**真的执行了且没报错**（模型确实办成了事）。
            // 顺手把跑通的工具名收起来 —— 学习池的分析器要按「这句话对上哪条工具」计数。
            Set<String> okTools = new LinkedHashSet<>();
            for (AiMessage s : span) {
                for (AiToolCallLog l : logsByMessage.getOrDefault(s.getId(), List.of())) {
                    if (Boolean.TRUE.equals(l.getExecuted()) && Boolean.TRUE.equals(l.getOk())
                            && l.getToolName() != null && !l.getToolName().isBlank()) {
                        okTools.add(l.getToolName());
                    }
                }
            }
            boolean acknowledged = !okTools.isEmpty();

            // ② 点选：这句话**逐字等于**上一轮给过的某个选项 —— 上一轮的 assistant 结果里带着 choices
            boolean picked = false;
            String text = m.getContent() == null ? "" : m.getContent().trim();
            Set<String> offered = Set.of();
            if (!text.isEmpty() && i > 0) {
                offered = optionsOfferedBefore(msgs, i, logsByMessage);
                picked = offered.contains(text);
            }
            // ②' **自定义回答**：抛过选项、但用户没用，而是自己说了。
            //     与「点选」互斥（点了就不算），所以复用同一个 offered 集合，不另查一遍。
            boolean customAnswer = !picked && !offered.isEmpty() && !text.isEmpty();
            // 给归类那一步的原料：上一轮给过什么、用户实际说了什么（见 offeredOptions 的说明）
            Set<String> offeredForLearning = offered;

            // ③ 赞/踩：挂在这一轮**有正文的那条**助手回复上（用户看到的就是它）
            String vote = "";
            for (AiMessage s : span) {
                if ("assistant".equals(s.getRole()) && votes.containsKey(s.getId())) {
                    vote = votes.get(s.getId());
                    break;
                }
            }

            /*
             * ④ 没听懂：**保守判据，三条同时成立**才算 ——
             *   a. 这一轮什么也没办成（没有成功执行的调用）；
             *   b. 也没问过任何问题（没有抛过选项 —— 抛了就是「在澄清」，不是「没听懂」）；
             *   c. 用户**紧接着又说话了**（还有下一轮）。
             * 三条缺一条就宁可不算：误报会直接污染学习池，漏报只是这一轮不参与统计。
             */
            boolean askedSomething = !optionsOfferedBefore(msgs, i, logsByMessage).isEmpty()
                    || !optionsOfferedInSpan(span, logsByMessage).isEmpty();
            boolean misunderstood = hasNextUser && !acknowledged && !askedSomething;

            // ⑤ 弃聊：这是会话里最后一条用户消息，而且此后一条助手回复都没有
            boolean abandoned = !hasNextUser && span.isEmpty();

            out.add(new TurnSignals(sessionId, m.getId(), text,
                    acknowledged, misunderstood, picked, customAnswer, offeredForLearning, vote, abandoned, okTools));
        }
        return out;
    }

    /** 这一轮**抛出过**的选项文案（给「没听懂」用）。 */
    private Set<String> optionsOfferedInSpan(List<AiMessage> span, Map<Long, List<AiToolCallLog>> logsByMessage) {
        Set<String> out = new LinkedHashSet<>();
        for (AiMessage s : span) {
            if (!"assistant".equals(s.getRole())) {
                continue;
            }
            for (AiToolCallLog l : logsByMessage.getOrDefault(s.getId(), List.of())) {
                collectOptionTexts(l.getRawResult(), out);
            }
        }
        return out;
    }

    /** 上一轮（i 之前最近的那一段 assistant）抛出过的选项文案。 */
    private Set<String> optionsOfferedBefore(List<AiMessage> msgs, int userIndex,
                                             Map<Long, List<AiToolCallLog>> logsByMessage) {
        Set<String> out = new LinkedHashSet<>();
        for (int k = userIndex - 1; k >= 0; k--) {
            AiMessage s = msgs.get(k);
            if ("user".equals(s.getRole())) {
                break; // 只回头看**紧挨着的上一轮**
            }
            if ("assistant".equals(s.getRole())) {
                for (AiToolCallLog l : logsByMessage.getOrDefault(s.getId(), List.of())) {
                    collectOptionTexts(l.getRawResult(), out);
                }
            }
        }
        return out;
    }

    /**
     * 从一段工具结果原文里抠出**可点选项的文案**（`label` 与 `value` 都收）。
     *
     * <p>两个都收：界面把 `value` 发回来当用户那句话，而气泡上显示的是 `label`。
     * 「猜你想问」那条通道两者相同；工具候选那条不同 —— 只收一个会漏。
     *
     * <p>解析失败一律当没有：这是**判据**，坏数据不该让整轮统计炸掉。
     *
     * <p><b>静态且不碰仓储</b>，所以能直接单测 —— 这段的 JSON 形状有两个来源
     * （`choices` 与 `questions[].options`），是最容易写漏的地方。
     */
    static Set<String> optionTextsOf(String rawResult, ObjectMapper objectMapper) {
        Set<String> out = new LinkedHashSet<>();
        if (rawResult == null || rawResult.isBlank()) {
            return out;
        }
        try {
            JsonNode root = objectMapper.readTree(rawResult);
            collectFrom(root.path("choices"), out);
            JsonNode questions = root.path("questions");
            if (questions.isArray()) {
                for (JsonNode q : questions) {
                    collectFrom(q.path("options"), out);
                }
            }
        } catch (Exception e) {
            // 判据用，坏数据跳过
        }
        return out;
    }

    private void collectOptionTexts(String rawResult, Set<String> out) {
        out.addAll(optionTextsOf(rawResult, objectMapper));
    }

    private static void collectFrom(JsonNode arr, Set<String> out) {
        if (!arr.isArray()) {
            return;
        }
        for (JsonNode o : arr) {
            String label = o.path("label").asText("");
            String value = o.path("value").asText("");
            if (!label.isBlank()) {
                out.add(label.trim());
            }
            if (!value.isBlank()) {
                out.add(value.trim());
            }
        }
    }

    private static long longOf(Object v) {
        if (v instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(v).trim());
        } catch (RuntimeException e) {
            return 0L;
        }
    }
}
