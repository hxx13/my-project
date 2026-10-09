package com.example.demo.modules.ai.tool;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * 本轮发哪些工具包 —— 全平台**唯一**的裁剪接缝。
 *
 * <h2>当前口径：全量下发（不收窄）</h2>
 * {@link #routeForTurn} 现在把能力过滤后的包**原样全发**。这里曾经做关键词收窄（每轮只发命中域的
 * 几个包、上限 6 个），2026-10-09 关掉，真机复现如下：
 * <p>
 * 上一轮助手在正文里列过能力清单之后，用户说「直接下单」——原话一个域词都没有，而历史正文里的
 * 「审核 / 免冻 / 环境 / 培训 / 笼位」等词全成了命中，6 个包位被占满，**物资选购被挤出**，
 * 模型只能答「这轮没有商城类的工具」。用户换一句「商城领用」就识别到了。
 *
 * <h2>为什么不是「少补一个词」</h2>
 * 根因是**收窄这个动作本身不可靠**：命中只说明「这个域被提到了」，不说明「用户要的就只有这几个域」。
 * 于是每一次收窄都可能把一个用户确实需要、但没说出关键词的域静默丢掉，用户看到的是
 * 「平台没有这个功能」——代价最高的一种错。前一天的修法是往词表里补「打开 / 在哪儿 / 提醒我」
 * 这类动作词，属于打地鼠（补完这个词，下一个说法照样漏）。
 * 同理，**收窄本身还会加剧同族误选**：模型手里只剩半个族时，只能在错的工具里挑。
 *
 * <h2>但接缝必须留着（包数会涨）</h2>
 * 全量下发的代价（18 个包 ≈ 6.8 万字符工具前缀，每轮恒定、可命中 prompt 缓存）现在可以接受，
 * 但包数继续长下去就不行了。所以这里**故意保留**了收窄实现与每个包的词汇表
 * （{@link AiToolPack#routeHints()}），只是**不在本轮路径上调它**：
 * <ul>
 *   <li>{@link #routeForTurn} —— 本轮真正发哪些包。要重新收窄，只改这一个方法，调用方不动；</li>
 *   <li>{@link #route} —— 现成的关键词收窄实现（已弃用，仅供包数增长后重启时复用/参照）；</li>
 *   <li>若将来改成**让模型选包**（对「说不出关键词」最稳），路由 prompt 的域清单也来自包自己
 *       —— {@code packKey} / {@code displayName} / {@code routeHints}，加包依旧零改动既有文件（E1）。</li>
 * </ul>
 *
 * <p>无论用哪套规则，输出的包**顺序必须恒等于注册顺序**（包名序）—— 顺序一漂，prompt 缓存前缀
 * 就全失效（设计文档 §10.2）。
 */
@Component
public class AiPackRouter {

    private static final Logger log = LoggerFactory.getLogger(AiPackRouter.class);

    /** 人员/课题组解析是所有场景的公共前置，恒定带上（设计文档 §6.2）。 */
    static final String COMMON_PACK = "common";

    /**
     * 一轮最多带几个包（含 common）。**当前不生效**（{@link #routeForTurn} 全量下发），
     * 仅供 {@link #route} 使用。
     *
     * <p>按**包数**而不是工具数设上限：每包 3~8 个工具，数量级可预期；而工具数是选包的结果，
     * 拿结果当限制会变成「先算一遍才能决定选谁」。6 个包 ≈ 25~30 个工具。
     */
    static final int MAX_PACKS_PER_TURN = 6;

    /**
     * 本轮发哪些包。
     *
     * <p>**现在恒等于入参本身**（调用方已按注册顺序排好、且已按能力过滤）—— 不做任何收窄，
     * 理由见类注释。要恢复收窄（或改成让模型选包），改这里一处即可。
     *
     * @param packs          全部包（已排序、已按能力过滤）
     * @param contextPage    载体上报的入口页面。当前不参与决策，保留是为了重启收窄时不必改调用方签名
     * @param currentInput   本轮用户原话。同上
     * @param sessionContext 最近一轮助手正文。同上
     */
    public List<AiToolPack> routeForTurn(Collection<AiToolPack> packs, String contextPage,
                                         String currentInput, String sessionContext) {
        List<AiToolPack> out = new ArrayList<>(packs);
        if (log.isDebugEnabled()) {
            log.debug("[ai-pack] 全量下发 {} 个包（收窄已停用）", out.size());
        }
        return out;
    }

    /**
     * 关键词收窄的现成实现。**已弃用** —— 本轮路径不再调用它（见类注释的复现）；
     * 保留是因为包数增长后需要重启收窄，届时可在此换规则，或直接改 {@link #routeForTurn}。
     *
     * @deprecated 命中一个域不等于「用户只要这几个域」，会静默漏发；见类注释。
     */
    @Deprecated
    public List<AiToolPack> route(Collection<AiToolPack> packs, String contextPage, String recentText) {
        List<AiToolPack> ordered = new ArrayList<>(packs);
        if (ordered.size() <= MAX_PACKS_PER_TURN) {
            return ordered;
        }
        String hay = join(contextPage, recentText);

        List<AiToolPack> common = new ArrayList<>();
        List<AiToolPack> hit = new ArrayList<>();
        for (AiToolPack pack : ordered) {
            if (COMMON_PACK.equals(pack.packKey())) {
                common.add(pack);
                continue;
            }
            if (weight(pack, hay) > 0) {
                hit.add(pack);
            }
        }
        if (hit.isEmpty()) {
            log.debug("[ai-pack] 无命中，保守全包下发（{} 个包）", ordered.size());
            return ordered;
        }
        // 命中的包按命中词数从多到少排；同分保持注册顺序（List.sort 是稳定的）
        List<AiToolPack> ranked = new ArrayList<>(hit);
        ranked.sort(Comparator.comparingInt((AiToolPack p) -> weight(p, hay)).reversed());

        int keep = Math.max(1, MAX_PACKS_PER_TURN - common.size());
        List<AiToolPack> chosen = new ArrayList<>(ranked.subList(0, Math.min(keep, ranked.size())));
        chosen.addAll(common);
        if (chosen.size() < ordered.size()) {
            log.debug("[ai-pack] 命中 {} 个包，收窄到 {} 个：{}", hit.size(), chosen.size(),
                    chosen.stream().map(AiToolPack::packKey).toList());
        }

        List<AiToolPack> out = new ArrayList<>();
        for (AiToolPack pack : ordered) {
            if (chosen.contains(pack)) {
                out.add(pack);
            }
        }
        return out;
    }

    /**
     * 命中几个路由词。{@link AiToolPack#packKey()} 与 {@link AiToolPack#displayName()} 天然算路由词
     * —— 英文 key 直接命中页面路径（{@code /console/admin/door-control} → {@code door}）。
     *
     * <p>仅供 {@link #route} 使用（已弃用的收窄规则）。
     */
    static int weight(AiToolPack pack, String hay) {
        String flat = flatten(hay);
        int n = 0;
        if (contains(flat, pack.packKey())) {
            n++;
        }
        if (contains(flat, pack.displayName())) {
            n++;
        }
        for (String hint : pack.routeHints()) {
            if (contains(flat, hint)) {
                n++;
            }
        }
        return n;
    }

    /**
     * 去掉分隔符再比：路径里是 {@code /supplies/process}，而包名是 {@code suppliesProcess}
     * —— 不归一化就永远匹配不上。同时抹掉空格与中缀点，让「领用单 / 出库」这类写法也能命中。
     */
    private static String flatten(String text) {
        return text == null ? "" : text.toLowerCase(Locale.ROOT).replaceAll("[\\s/\\-_·]+", "");
    }

    private static boolean contains(String flatHay, String word) {
        if (word == null || word.isBlank()) {
            return false;
        }
        return flatHay.contains(flatten(word));
    }

    private static String join(String a, String b) {
        return ((a == null ? "" : a) + ' ' + (b == null ? "" : b)).toLowerCase(Locale.ROOT);
    }
}
