package com.example.demo.modules.ai.service;

import com.example.demo.modules.ai.entity.AiLearnEntry;
import com.example.demo.modules.ai.mapper.AiLearnEntryMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 学习池的**分析器**：从对话留痕里捞「用户这么说 → 对上这条工具」的候选，写进池子（观察中）。
 *
 * <h2>它只做两件事</h2>
 * ① **频次统计**（{@link #candidates}，纯函数、可单测）：同一句话反复对上同一条工具 → 值得沉淀；
 * ② 写进池子，状态 {@code WATCHING}（观察中）。
 *
 * <p><b>归类去重</b>（把「拖把／胶棉拖把／那种拖把」并成一条）交给大模型，但那一步**不在这里** ——
 * 它是「只归类、不生成」，是把本类捞出的候选**合并**，不是凭空造词。等这批跑出真实候选再做，
 * 免得先写一个没数据喂的调用。
 *
 * <h2>取向：宁可漏学，不可学错</h2>
 * 学错了会直接进提示词、影响**所有人**的对话；漏学只是这条说法下次再说一遍时再来。
 */
@Service
public class AiLearnAnalyzerService {

    private static final Logger log = LoggerFactory.getLogger(AiLearnAnalyzerService.class);

    /** 「说法」的长度上下限：太短没有信息量（「好」「嗯」），太长是整段话、不是一条可复用的说法。 */
    static final int MIN_PHRASE_LEN = 3;
    static final int MAX_PHRASE_LEN = 30;

    /**
     * 计数用的内部分隔符。
     *
     * <p><b>不能用空格</b>：说法里本来就可能带空格（「把动物订购单导出成 Excel」），
     * 用空格拼键、再按第一个空格切，会把「导出成」当成工具名。
     * 用一个在用户输入里不可能出现的控制字符。
     */
    static final char SEP = '\u0001';

    /**
     * 一轮观测：用户说了什么 + 这一轮**跑通了**哪些工具。
     *
     * @param text    用户原话
     * @param picked  这句话是不是「点了我们给的选项」—— 点选不是自然说法，不该学
     * @param okTools 这一轮**执行成功**的工具名
     */
    public record TurnObservation(String text, boolean picked, Set<String> okTools,
                                  /** 这一轮之前给过的选项文案 —— 交给归类那一步分辨「点了我们给的」还是「自己另说的」。 */
                                  Set<String> offeredOptions) {

        /** 老的两参写法：不关心选项上下文的调用方（如单测）用。 */
        public TurnObservation(String text, boolean picked, Set<String> okTools) {
            this(text, picked, okTools, Set.of());
        }
    }

    /** 捞出来的候选：一句话对上一条工具，出现了几次。 */
    public record Candidate(String phrase, String target, int hits) {
    }

    /**
     * 从一堆观测里捞候选 —— **纯函数，不碰仓储**。
     *
     * <p>三条筛法，每条都为了「别把噪声当说法学进去」：
     * <ol>
     *   <li><b>点选的不算</b>：那是我们给的选项文案，不是用户自己的话；学它等于把推荐词抄回学习池。</li>
     *   <li><b>这一轮只跑通了「恰好一条」工具才算</b>：跑了三条就说不清这句话对上哪条，
     *       归因不可靠 —— <b>这是最容易学错的地方</b>，宁可不学。</li>
     *   <li><b>长度卡在 3–30 字</b>：太短没信息量，太长是整段描述。</li>
     * </ol>
     * 最后按 (说法, 工具) 计数，只留出现 {@code minHits} 次以上的；次数降序，同次数按说法字典序（结果稳定可断言）。
     */
    static List<Candidate> candidates(List<TurnObservation> turns, int minHits) {
        Map<String, Integer> counted = new LinkedHashMap<>();
        if (turns == null) {
            return List.of();
        }
        for (TurnObservation t : turns) {
            if (t == null || t.picked() || t.text() == null) {
                continue;
            }
            String phrase = t.text().strip().replaceAll("\\s+", " ");
            if (phrase.length() < MIN_PHRASE_LEN || phrase.length() > MAX_PHRASE_LEN) {
                continue;
            }
            if (t.okTools() == null || t.okTools().size() != 1) {
                continue; // 说不清对上哪条，不学
            }
            String target = t.okTools().iterator().next();
            counted.merge(phrase + SEP + target, 1, Integer::sum);
        }

        List<Candidate> out = new ArrayList<>();
        for (Map.Entry<String, Integer> e : counted.entrySet()) {
            if (e.getValue() < Math.max(1, minHits)) {
                continue;
            }
            int sep = e.getKey().indexOf(SEP);
            if (sep < 0) {
                continue; // 理论上不会有；真出现了就跳过，别抛异常把整批打断
            }
            out.add(new Candidate(e.getKey().substring(0, sep), e.getKey().substring(sep + 1), e.getValue()));
        }
        out.sort(Comparator.comparingInt(Candidate::hits).reversed()
                .thenComparing(Candidate::phrase));
        return out;
    }

    private final AiLearnEntryMapper mapper;

    public AiLearnAnalyzerService(AiLearnEntryMapper mapper) {
        this.mapper = mapper;
    }

    /**
     * 把捞出来的候选写进池子（**观察中**，不生效）。
     *
     * @return 实际写入的条数
     */
    public int absorb(String batchNo, List<Candidate> candidates) {
        int n = 0;
        for (Candidate c : candidates) {
            AiLearnEntry e = new AiLearnEntry();
            e.setBatchNo(batchNo);
            e.setLayer("tool_phrase");
            e.setPhrase(c.phrase());
            e.setTarget(c.target());
            e.setStatus(AiLearnEntry.WATCHING);
            e.setSource("STATS");
            e.setHits(c.hits());
            e.setNote("统计到的：这句话出现了 " + c.hits() + " 次，每次都对上 " + c.target());
            mapper.upsert(e);
            n++;
        }
        log.info("[ai-learn] 批次 {} 吸收 {} 条候选（观察中）", batchNo, n);
        return n;
    }
}
