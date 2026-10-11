package com.example.demo.modules.ai.service;

import com.example.demo.modules.ai.bootstrap.AiCopyConfigStore;
import com.example.demo.modules.ai.mapper.AiGatewayMapper;
import com.example.demo.modules.ai.mapper.AiLearnEntryMapper;
import com.example.demo.modules.ai.service.AiLearnAnalyzerService.Candidate;
import com.example.demo.modules.ai.service.AiLearnAnalyzerService.TurnObservation;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 学习池的**接线**：扫最近会话 → 喂给分析器 → 够条件就写进池子（观察中）。
 *
 * <h2>触发条件不是「定期」，是「攒够了才学」（用户 2026-10-11 定）</h2>
 * 两条**同时**满足才算到点：
 * <ol>
 *   <li><b>够格的新说法累积到阈值</b> —— 这一批里「池子里还没有」的候选够 N 条。
 *       对话量只是粗代理：某天涌进来 500 轮、全是同一批老说法，那这一轮学习纯属白跑，
 *       还白白让提示词缓存失效一次。真正该抓的信号是「出现了我没见过的新说法」。</li>
 *   <li><b>距上次学习满冷却期</b> —— 兜住「一天涌进来就反复学」。</li>
 * </ol>
 * 所以忙的时候学得勤、闲的时候不空跑、老话重说的时候一次都不学。
 *
 * <h2>写进去的是「观察中」</h2>
 * {@code absorb} 落的都是 {@code WATCHING} —— 挂进提示词但不改线上行为，
 * 由影子期跑数据决定转正/淘汰（那是下一期）。
 */
@Service
public class AiLearnRunner {

    private static final Logger log = LoggerFactory.getLogger(AiLearnRunner.class);

    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    /** 一次批处理扫最近多少个会话 —— 学的是**当前**的说法，翻半年前的老会话没意义还慢。 */
    static final int RECENT_SESSIONS = 200;

    /** 候选进池子的最低出现次数：只出现一次的说法很可能是口误或一次性措辞。 */
    static final int MIN_HITS = 2;

    /** 触发阈值：这一批里「池子里还没有」的候选够这么多条，才值得跑一次学习。 */
    static final int NEW_CANDIDATE_THRESHOLD = 5;

    /** 冷却期：距上次学习不够这么久就不学。 */
    static final long COOLDOWN_MS = 12L * 3600 * 1000;

    /**
     * 一次学习批的原料：候选 + 「这句话之前给过哪些选项」。
     *
     * <p>后者要一路带到**归类那一步** —— 光靠字符串比对分不清「用户点了我们给的」和
     * 「他自己另说了一句意思差不多的话」，后者会把我们自己写的措辞当成用户的说法学进去。
     */
    record Plan(List<Candidate> candidates, Map<String, Set<String>> optionsByPhrase) {
    }

    private static final String MODULE = "ai";
    private static final String LAST_RUN_KEY = "ai.learn.lastRunAt";

    /**
     * 到点了吗 —— **纯函数，可单测**。两条同时满足才算到点，缺一条都不学。
     */
    static boolean due(int freshCount, long sinceLastMs, int threshold, long cooldownMs) {
        return freshCount >= threshold && sinceLastMs >= cooldownMs;
    }

    private final AiGatewayMapper gatewayMapper;
    private final AiTurnSignalService signalService;
    private final AiLearnAnalyzerService analyzer;
    private final AiLearnEntryMapper entryMapper;
    private final AiCopyConfigStore configStore;
    private final AiLearnClassifyService classifier;
    private final AiLearnScorer scorer;

    public AiLearnRunner(AiGatewayMapper gatewayMapper,
                         AiTurnSignalService signalService,
                         AiLearnAnalyzerService analyzer,
                         AiLearnEntryMapper entryMapper,
                         AiCopyConfigStore configStore,
                         AiLearnClassifyService classifier,
                         AiLearnScorer scorer) {
        this.gatewayMapper = gatewayMapper;
        this.signalService = signalService;
        this.analyzer = analyzer;
        this.entryMapper = entryMapper;
        this.configStore = configStore;
        this.classifier = classifier;
        this.scorer = scorer;
    }

    /** 到点就跑，不到点直接返回 0（并把「为什么没跑」记一行，免得查不出为什么没动静）。 */
    public int runIfDue() {
        long since = sinceLastRunMs();
        // 冷却期是两条里**便宜**的那条，先判它：没过就根本不用去扫那 200 个会话。
        // 两条是「且」，先判哪条都不改变结果 —— 但一天来看三眼，这样能省掉绝大多数空扫。
        if (since < COOLDOWN_MS) {
            // 注意：SLF4J 的 {} 不支持 {:.1f} 这类格式符，会原样打出来 —— 自己先算好
            log.info("[ai-learn] 没到点：距上次 {} 小时（冷却 {} 小时）",
                    Math.round(since / 3600000.0), COOLDOWN_MS / 3600000);
            return 0;
        }
        Plan plan = collectCandidates();
        List<Candidate> candidates = plan.candidates();
        Set<String> known = knownKeys();
        int fresh = 0;
        for (Candidate c : candidates) {
            if (!known.contains(key(c.phrase(), c.target()))) {
                fresh++;
            }
        }
        // 到这里冷却期已确定过了，due 只剩第二道门槛在起作用；仍走它一次，让「规则只有一处」不被悄悄改掉
        if (!due(fresh, since, NEW_CANDIDATE_THRESHOLD, COOLDOWN_MS)) {
            log.info("[ai-learn] 没到点：新候选 {} 条（门槛 {}）", fresh, NEW_CANDIDATE_THRESHOLD);
            return 0;
        }
        return writeBatch(plan);
    }

    /** 强制跑一批（超管手动触发）。忽略触发条件。 */
    public int runNow() {
        return writeBatch(collectCandidates());
    }

    private int writeBatch(Plan plan) {
        List<Candidate> candidates = plan.candidates();
        String batchNo = "B" + LocalDateTime.now().format(TS);
        int n = analyzer.absorb(batchNo, candidates);
        /*
         * 归类 + 把整句压成短说法。**这一步失败不影响这一批**：
         * refine 自己的约定就是「要么动到有结果，要么原样留着」，外面再兜一层是防它抛出去
         * 把整个学习批打断（那会让「吸收」也白做）。
         */
        try {
            n = classifier.refine(plan.optionsByPhrase());
        } catch (Exception e) {
            log.warn("[ai-learn] 归类这一步出错，保留未归类的原始条目: {}", e.getMessage());
        }
        /*
         * **归类之后**才判定去留：归类会改说法、并会把几条的次数合并过来，
         * 先判后归会拿旧说法、旧次数算分，等于白判。
         */
        try {
            Map<String, Integer> v = scorer.settle();
            log.info("[ai-learn] 影子判定：转正 {}、淘汰 {}、继续观察 {}",
                    v.get("promoted"), v.get("dropped"), v.get("kept"));
        } catch (Exception e) {
            log.warn("[ai-learn] 影子判定出错，池子保持不动: {}", e.getMessage());
        }
        // 记下这次跑的时间 —— 冷却期就是拿它比的；写在库里，重启不丢
        configStore.upsertValue(MODULE, LAST_RUN_KEY, String.valueOf(System.currentTimeMillis()));
        log.info("[ai-learn] 批次 {} 完成，{} 条（观察中）", batchNo, n);
        return n;
    }

    /**
     * 扫最近若干会话 → 压成「观测」→ 交给分析器捞候选。
     *
     * <p>名字不叫 {@code candidates}：那样会和 {@link AiLearnAnalyzerService#candidates} 撞名，
     * 读代码时容易以为是同一件事（一个捞候选、一个只是准备原料）。
     */
    private Plan collectCandidates() {
        List<TurnObservation> observations = new ArrayList<>();
        List<Long> sessionIds = gatewayMapper.selectRecentSessionIds(RECENT_SESSIONS);
        if (sessionIds == null) {
            return new Plan(List.of(), Map.of());
        }
        for (Long sid : sessionIds) {
            for (AiTurnSignalService.TurnSignals s : signalService.signalsOfSession(sid)) {
                /*
                 * **净分为负的那一轮不参与学习**（设计 §5：判据以行为为主、赞踩为辅）。
                 *
                 * 这里接的是 `TurnSignals.score()` —— 赞 +2 / 踩 −3 / 认了 +2 / 没听懂 −3 / 弃聊 −1。
                 * 在接上之前，那套权重**定义了却一次都没被调用**：赞踩采集了、权重写好了，
                 * 判定却只看「专一性」一个数。这正是这个仓库高发的「声明了却没实装」。
                 *
                 * 门槛取「< 0」而不是「<= 0」，是有意的保守：**只丢掉明确被否定的一轮**。
                 * 取 <= 0 会把「有工具跑通、但用户没点赞」这种绝大多数正常轮也一起丢掉，学习会直接停摆。
                 * 例：跑通 + 被踩 = 2−3 = −1 → 丢；跑通 + 无表态 = 2 → 留。
                 */
                if (s.score() < 0) {
                    continue;
                }
                observations.add(new TurnObservation(
                        s.userText(), s.picked(), s.okTools(), s.offeredOptions()));
            }
        }
        /*
         * 「这句话之前给过哪些选项」也带上 —— 交给**归类那一步**去分辨
         * 「用户点了我们给的」还是「他自己另说了一句」。字符串比对分不出后者，
         * 于是会把**我们自己写的措辞**当成用户的说法学进池子、再注入回去，绕成一个蠢环。
         */
        Map<String, Set<String>> optionsByPhrase = new LinkedHashMap<>();
        for (TurnObservation o : observations) {
            if (o.offeredOptions() == null || o.offeredOptions().isEmpty() || !StringUtils.hasText(o.text())) {
                continue;
            }
            optionsByPhrase.computeIfAbsent(o.text().strip(), k -> new LinkedHashSet<>())
                    .addAll(o.offeredOptions());
        }
        return new Plan(AiLearnAnalyzerService.candidates(observations, MIN_HITS), optionsByPhrase);
    }

    /** 池子里已有的键。 */
    private Set<String> knownKeys() {
        Set<String> known = new HashSet<>();
        List<Map<String, Object>> rows = entryMapper.allKeys();
        if (rows == null) {
            return known;
        }
        for (Map<String, Object> r : rows) {
            Object layer = r.get("layer");
            Object phrase = r.get("phrase");
            Object target = r.get("target");
            if (layer != null && phrase != null && target != null) {
                known.add(key(String.valueOf(phrase), String.valueOf(target)));
            }
        }
        return known;
    }

    /**
     * 拼键比对 —— **在 Java 里拼，不用 SQL 的 CONCAT**：说法里什么字符都可能有，
     * 让 SQL 拼分隔符迟早出岔子（分析器里已经为同一件事踩过一次）。
     */
    private static String key(String phrase, String target) {
        return phrase + AiLearnAnalyzerService.SEP + target;
    }

    private long sinceLastRunMs() {
        Map<String, String> values = configStore.readValues(MODULE);
        String raw = values == null ? null : values.get(LAST_RUN_KEY);
        if (raw == null || raw.isBlank()) {
            return Long.MAX_VALUE; // 从没跑过 → 冷却期视为已过（第一条门槛管着别乱跑）
        }
        try {
            return Math.max(0, System.currentTimeMillis() - Long.parseLong(raw.trim()));
        } catch (NumberFormatException e) {
            return Long.MAX_VALUE;
        }
    }
}
