package com.example.demo.modules.ai.service;

import com.example.demo.modules.ai.entity.AiLearnEntry;
import com.example.demo.modules.ai.mapper.AiLearnEntryMapper;
import com.example.demo.modules.llm.service.DashScopeChatClient;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 学习池的**归类与提炼**：把一批「用户原话 → 工具」收成短说法，并把同义的并成一条。
 *
 * <h2>为什么需要它（以及为什么不是设计文档里写的那样）</h2>
 * 设计文档 §12.3 定的是「分析器只归类、不生成」，假想的输入是「拖把 / 胶棉拖把 / 那种拖把」
 * 这类**短词**。但 2026-10-11 实跑发现，频次统计捞出来的实际是**整句问法**
 * （「胶棉拖把的出入库流水给我看看」）—— 这类东西再挂回提示词毫无价值，
 * **因为用户的原话模型眼前就有**。所以这一步必须**同时**做两件事：归类**并且**把整句压成短说法。
 *
 * <h2>安全边界：模型碰不到工具名</h2>
 * 这是这一步唯一有风险的地方，所以钉死两条：
 * <ol>
 *   <li>**工具名只能原样照抄输入里给的**。模型返回的工具名只要不在输入集合里，**整条丢弃**
 *       —— 它编不出一个不存在的工具，也就编不出一次越权。</li>
 *   <li>**先验证、后落库**。解析失败、或没有任何一条通过校验时，**原批次一个字都不动** ——
 *       宁可留着那批长句子，也不能因为一次模型抽风把刚学到的东西清空。</li>
 * </ol>
 * 换成「模型只改写说法、工具名由我们照着定」，这一步就从「自由生成」降级成了「受约束的重写」。
 */
@Service
public class AiLearnClassifyService {

    private static final Logger log = LoggerFactory.getLogger(AiLearnClassifyService.class);

    /** 短说法的长度上限。与 {@link AiLearnAnalyzerService} 捞候选时的上限取同一个量级。 */
    static final int MAX_PHRASE_LEN = 20;

    /** 一次最多送去归类的条数 —— 归类本身是低价值劳动，不值得为它铺一次巨长的提示词。 */
    static final int MAX_INPUT = 60;

    /** 合并键的分隔符：说法里什么字符都可能有，不能拿空格拼（与分析器同一个教训）。 */
    static final char SEP = '\u0001';

    private final AiLearnEntryMapper mapper;
    private final DashScopeChatClient chatClient;
    private final ObjectMapper objectMapper;

    public AiLearnClassifyService(AiLearnEntryMapper mapper,
                                  DashScopeChatClient chatClient,
                                  ObjectMapper objectMapper) {
        this.mapper = mapper;
        this.chatClient = chatClient;
        this.objectMapper = objectMapper;
    }

    /**
     * 把池子里「观察中」的说法收成短说法。
     *
     * <p>**失败就原样留着**：解析失败、或没有任何一条通过校验时，一条都不删。
     *
     * @param optionsByPhrase 原话 → 「这一轮之前我们给过哪些选项」。
     *                        带这个是为了让模型分辨「用户点了我们给的」还是「他自己另说的」——
     *                        前者等于是**我们自己写的措辞**，学它再注入回去会绕成一个蠢环。
     * @return 归类之后收成了几条
     */
    public int refine(Map<String, Set<String>> optionsByPhrase) {
        List<AiLearnEntry> all = mapper.listWatching(MAX_INPUT);
        int before = all == null ? 0 : all.size();
        // 一条没什么可归的；归类是「多句收成一句」的活
        if (before < 2) {
            return before;
        }
        List<AiLearnEntry> rows = new ArrayList<>();
        Set<String> allowedTargets = new HashSet<>();
        // 键是「说法 + 目标」：同一个说法可能对上两条不同的工具（设计 §6 说这种正是要交给数据判的），
        // 只按说法存会把两条工具的次数混在一起，算出来的分就不是「这一条工具占多少」了。
        Map<String, Integer> hitsByKey = new HashMap<>();
        Map<String, String> batchByKey = new HashMap<>();
        // 判死那些行时要按 id 改状态 —— 用说法+目标反查（不能按名称删：删了就查不到为什么没学）
        Map<String, Long> idByKey = new HashMap<>();
        for (AiLearnEntry e : all) {
            if (e == null || !StringUtils.hasText(e.getPhrase()) || !StringUtils.hasText(e.getTarget())) {
                continue;
            }
            String phrase = e.getPhrase().strip();
            String target = e.getTarget().strip();
            rows.add(e);
            allowedTargets.add(target);
            int h = e.getHits() == null ? 1 : e.getHits();
            hitsByKey.merge(phrase + SEP + target, h, Math::max);
            // 列表已按 hits 降序，所以 putIfAbsent 留下的就是「贡献最大的那条」的批次号
            batchByKey.putIfAbsent(phrase + SEP + target, e.getBatchNo());
            idByKey.putIfAbsent(phrase + SEP + target, e.getId());
        }
        if (rows.size() < 2) {
            return before;
        }
        List<Group> groups;
        try {
            groups = parseGroups(callModel(rows, optionsByPhrase), objectMapper, allowedTargets, hitsByKey);
        } catch (Exception e) {
            log.warn("[ai-learn] 归类失败，池子保持不动: {}", e.getMessage());
            return before;
        }
        if (groups.isEmpty()) {
            log.warn("[ai-learn] 归类没产出可用结果，池子保持不动（{} 条）", before);
            return before;
        }
        int removed = 0;
        int skippedPick = 0;
        for (Group g : groups) {
            /*
             * 模型判出来「这就是我们上一轮给过的选项措辞」→ **不学，但也不删**：留成 DROPPED 并写上理由。
             *
             * 为什么不删：删了就**永远查不到「为什么没学这条」**—— 一条说法静悄悄消失，只剩一行服务端日志。
             * 留成 DROPPED 之后后台一眼能看到「没学什么、为什么」。而 DROPPED 不进提示词，
             * 留着不影响线上；且 `upsert` 遇到同一行只累加次数、**不动状态**，所以判过一次就不会再冒出来。
             *
             * 为什么必须挡：学它等于把**我们自己写的选项**当成用户的说法收进池子、再注入回去 —— 绕一个蠢环，
             * 还挤占了真正的说法该占的位置。
             */
            if (!g.custom()) {
                for (String p : g.from()) {
                    Long id = idByKey.get(p + SEP + g.target());
                    if (id != null) {
                        mapper.retire(id, AiLearnEntry.DROPPED, 0,
                                "模型判定这是「我们上一轮给过的选项措辞」，不算用户自己的说法，故未学");
                    }
                }
                skippedPick++;
                continue;
            }
            /*
             * 真合并：把被并掉的原话撤下。**只撤模型点名的那些**（`from` 里列出来的），
             * 没被点名的原样留着 —— 这样模型漏答、乱答时，最坏也只是「这次没并成」，绝不会把池子删空。
             */
            for (String p : g.from()) {
                if (p.equals(g.phrase())) {
                    continue; // 短说法与某条原话同名时，那条正是我们要保留的，别删自己
                }
                removed += mapper.deleteByKey("tool_phrase", p, g.target());
            }
            AiLearnEntry e = new AiLearnEntry();
            // 沿用贡献最大的那条的批次号 —— 保住「按批回滚」的归属
            e.setBatchNo(batchOf(g, batchByKey));
            e.setLayer("tool_phrase");
            e.setPhrase(g.phrase());
            e.setTarget(g.target());
            e.setStatus(AiLearnEntry.WATCHING);
            e.setSource("STATS");
            e.setHits(g.hits());
            e.setNote(g.note());
            mapper.upsert(e);
        }
        log.info("[ai-learn] 归类：{} 条观察中 → 撤下 {} 条、收成 {} 条（另有 {} 条判为「我们给的措辞」未学）",
                before, removed, groups.size() - skippedPick, skippedPick);
        return groups.size() - skippedPick;
    }

    /** 合并后的条目算哪一批：取被并的原话里批次号最有代表性的那个（列表按 hits 降序，即贡献最大的那条）。 */
    private static String batchOf(Group g, Map<String, String> batchByKey) {
        for (String p : g.from()) {
            String b = batchByKey.get(p + SEP + g.target());
            if (StringUtils.hasText(b)) {
                return b;
            }
        }
        return batchByKey.get(g.phrase() + SEP + g.target());
    }

    private String callModel(List<AiLearnEntry> input, Map<String, Set<String>> optionsByPhrase) {
        StringBuilder sb = new StringBuilder();
        for (AiLearnEntry e : input) {
            sb.append("- 「").append(e.getPhrase().strip()).append("」→ ").append(e.getTarget().strip())
              .append("（出现 ").append(e.getHits() == null ? 1 : e.getHits()).append(" 次）\n");
            // 把「这句话之前我们给过哪些选项」摆到模型眼前 —— 它才有办法分辨
            // 「用户点了我们给的」还是「他自己另说了一句」
            Set<String> offered = optionsByPhrase == null ? null : optionsByPhrase.get(e.getPhrase().strip());
            if (offered != null && !offered.isEmpty()) {
                sb.append("    ⚠️ 这一轮**之前**我们给过这些选项：");
                for (String o : offered) {
                    sb.append("「").append(o).append("」 ");
                }
                sb.append('\n');
            }
        }
        String system = """
                你是「说法归类器」。下面是一批【用户原话 → 最终用到的工具】，请做两件事：

                1. 把每句原话提炼成一个 2~6 个字的**短说法** —— 用户口语里最核心的那个词或短语。
                   例：「胶棉拖把的出入库流水给我看看」→「拖把流水」
                       「现在商城有哪些物资？库存还剩多少？」→「商城库存」
                       「把动物订购单导出成 Excel」→「订购单导出」
                2. 意思相同**且工具也相同**的，并成一条（短说法取最有代表性的那个）。
                3. **分辨「用户自己说的」和「我们给的」**：如果某条下面标了
                   「⚠️ 这一轮之前我们给过这些选项」，而用户那句话**就是在复述我们给的某个选项**
                   （只是换了标点、加了个「吧」「谢谢」这类），说明他**点了我们给的** ——
                   那不是他的说法，请标 `"custom": false`，我们不会学它。
                   只有当他**用词是他自己的**（哪怕意思相近）才标 `"custom": true`。
                   拿不准就标 true —— **宁可学，也别漏**。

                硬约束（违反的输出会被直接丢弃）：
                - **工具名必须原样照抄输入里的**，一个字都不能改；也**不许**新增输入里没有的工具名。
                - 短说法里不要有标点、不要写成整句、不要带「请/帮我/一下」这类客套词。
                - **短说法里不许出现具体的人名、工号、学号、单号、房间号、日期** —— 这一层是
                  **全站共用**的：写进具体的人名，下一个人根本不会这么说（没用），
                  而且等于把别人的信息带给了所有人。一律换成泛指：
                  「把张鹏的免冻收回来」→「免冻收回」；「3F-201 的温度」→「房间温度」。
                - 只输出 JSON 数组，不要解释、不要 markdown 代码块围栏。

                输出格式（每项三个字段）：
                [{"target":"原样照抄的工具名","phrase":"短说法","custom":true,"from":["被合并的原话1","被合并的原话2"]}]
                """;
        List<Map<String, String>> messages = new ArrayList<>();
        messages.add(Map.of("role", "system", "content", system));
        messages.add(Map.of("role", "user", "content", sb.toString()));
        return chatClient.chatWithFallback(messages).content();
    }

    /**
     * 一次归类的结果。
     *
     * @param from   被它并掉的原话（只在模型点名时才撤，见 mapper 的说明）
     * @param custom false = 模型判定这句是**我们上一轮给过的选项措辞**，不是用户自己的说法 —— 不学
     */
    record Group(String target, String phrase, int hits, List<String> from, boolean custom, String note) {}

    /**
     * 解析模型输出。
     *
     * <p>**逐条校验、逐条丢**（不是整批丢）—— 校验点就两个：工具名必须在输入集合里、
     * 短说法非空且不过长。mapper 由调用方传入只为可单测（与 {@code DashScopeChatClient} 同一写法）。
     *
     * @param hitsByKey 「说法+目标 → 次数」。合并后的次数取**继承值与来源值的最大者**，见下。
     */
    static List<Group> parseGroups(String raw, ObjectMapper mapper,
                                   Set<String> allowedTargets, Map<String, Integer> hitsByKey) throws Exception {
        String text = raw == null ? "" : raw.strip();
        // 容忍模型把 JSON 包在 ```json 围栏里：直接取第一个 [ 到最后一个 ]
        int start = text.indexOf('[');
        int end = text.lastIndexOf(']');
        if (start < 0 || end <= start) {
            return List.of();
        }
        JsonNode arr = mapper.readTree(text.substring(start, end + 1));
        if (!arr.isArray()) {
            return List.of();
        }
        Map<String, Group> merged = new LinkedHashMap<>();
        for (JsonNode node : arr) {
            String target = node.path("target").asText("").strip();
            String phrase = node.path("phrase").asText("").strip();
            // ① 工具名必须是**输入里给过的**那个 —— 模型编的一律不要
            if (!allowedTargets.contains(target)) {
                continue;
            }
            // ② 短说法要像话：非空、不过长、不夹换行
            if (!StringUtils.hasText(phrase) || phrase.length() > MAX_PHRASE_LEN || phrase.contains("\n")) {
                continue;
            }
            // 同一个「短说法 + 工具」只留一条（模型可能自己就给重了）
            String key = phrase + SEP + target;
            if (merged.containsKey(key)) {
                continue;
            }
            /*
             * 次数怎么定 —— 这里踩过两次，规矩是「**继承原值、取最大、不累加**」：
             *
             * ① **继承**：模型常常给同一个意思换一个短说法（「温湿度查询」→「监测点温湿度」）。
             *    换名之后旧行被删、新行是全新的，若只按来源算，次数会掉回 1 —— 条目被打回观察中，
             *    之前攒的证据白费（实测就这么丢过一条）。
             * ② **取最大，不累加**：来源里的说法是同一个意思的不同叫法，累加会把「同一段时间里的
             *    几种叫法」当成多次独立证据，次数越跑越大。取最大既不会虚增，也不会低于真实证据。
             * ③ **去重**：模型偶尔会把同一个来源列两遍，不去重就会凭空翻倍。
             */
            int inherited = hitsByKey.getOrDefault(key, 0);
            int fromHits = 0;
            List<String> from = new ArrayList<>();
            for (JsonNode f : node.path("from")) {
                String p = f.asText("").strip();
                if (!StringUtils.hasText(p) || from.contains(p)) {
                    continue;
                }
                from.add(p);
                fromHits = Math.max(fromHits, hitsByKey.getOrDefault(p + SEP + target, 1));
            }
            int hits = Math.max(1, Math.max(inherited, fromHits));
            // 缺省 true：**拿不准就学**。模型漏给字段时不该静默丢掉一条真实说法
            boolean custom = !node.has("custom") || node.path("custom").asBoolean(true);
            int mergedCount = Math.max(1, from.size());
            merged.put(key, new Group(target, phrase, hits, List.copyOf(from), custom,
                    custom
                            ? "归类所得：由 " + mergedCount + " 句说法合并，对上 " + target
                            : "模型判定这是「我们上一轮给过的选项措辞」，不算用户自己的说法"));
        }
        return new ArrayList<>(merged.values());
    }
}
