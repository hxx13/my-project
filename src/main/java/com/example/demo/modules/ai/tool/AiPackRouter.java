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
 * L2 路由：**每轮只发相关的工具包**。准确率层，不是安全层 —— 路由错了最坏结果是模型不知道有这个工具，
 * 系统照样安全（设计文档 §4）。
 *
 * <p>为什么必须有它：设计文档 §6.3 的红线是**每轮发给模型的工具数**。实测全平台 1914 条路由收敛成
 * 31 个工具之后，「≥30 个」已经在红线上了 —— 工具的**描述**也要进 prompt，光是这一堆就让每一轮都变慢，
 * 而绝大多数对话只用到其中一两个域。§6.3 原话：「让『平台有 40 个工具』在模型眼里永远是『这一轮只有 8 个』」。
 *
 * <p>两条保守原则（都是刻意的，别当 bug 改）：
 * <ol>
 *   <li><b>命中为空就全给。</b>「办不了」比「慢一点」糟得多；路由是体验优化，不能变成功能开关。</li>
 *   <li><b>命中数在包数上限内就全给。</b>一句跨两个域的话（「把张立帅的免冻开了，再帮他领个水桶」）
 *       必须一次办完，不能为了省 token 把它切碎。</li>
 * </ol>
 *
 * <p>选包只做**筛选**，输出始终按注册顺序（包名序）—— 顺序一漂，prompt 缓存前缀就全失效（§10.2）。
 */
@Component
public class AiPackRouter {

    private static final Logger log = LoggerFactory.getLogger(AiPackRouter.class);

    /** 人员/课题组解析是所有场景的公共前置，恒定带上（设计文档 §6.2）。 */
    static final String COMMON_PACK = "common";

    /**
     * 一轮最多带几个包（含 common）。
     *
     * <p>按**包数**而不是工具数设上限：每包 3~8 个工具，数量级可预期；而工具数是选包的结果，
     * 拿结果当限制会变成「先算一遍才能决定选谁」。6 个包 ≈ 25~30 个工具，仍落在 §6.3 的
     * 「10~30 需要描述调优」区间里，离「>30 明显下降」只差一档。
     *
     * <p>**2026-10-08 由 4 提到 6**：包数长到 12 之后 4 个位子不够用了 —— 实测「我有什么待审核的」
     * 要同时带物资 / 笼位审核 / 笼架操作 / 培训四个域，加上常驻 common 正好 5，4 个位子根本放不下
     * （当时只能靠把总括词在多个包里重复来勉强凑）。同一轮里环境监测也被挤掉过一次。
     * 另外兜底规则是「一个都没命中就全包下发」（≈47 个工具），说明这个上限只是**常态优化**，
     * 不是能力红线 —— 放宽的代价是每轮多几百 token 的工具描述。
     */
    static final int MAX_PACKS_PER_TURN = 6;

    /**
     * 一轮的实际选包：**当轮原话优先**，只有它一个域都认不出，才把历史正文加进来。
     *
     * <p>为什么必须分两段：历史正文（最近一轮助手的话）参与路由是为了接住「那把它出库」
     * 这种没有域名词的追问。但助手在解释「什么我办不了」时会把自己**能办**的域挨个念一遍 ——
     * 那些词于是全成了命中，把用户当轮**真正**问的那个域挤出包位。实测：上一轮列过能力清单之后，
     * 「查询一下 2 楼的湿度情况」答的是「我这轮没有环境监测类的工具」。
     * 原话里有明确域名词时，历史不该有投票权。
     */
    public List<AiToolPack> routeForTurn(Collection<AiToolPack> packs, String contextPage,
                                         String currentInput, String sessionContext) {
        List<AiToolPack> ordered = new ArrayList<>(packs);
        if (ordered.size() <= MAX_PACKS_PER_TURN) {
            return ordered;
        }
        String input = currentInput == null ? "" : currentInput;
        String inputHay = join(contextPage, input);
        boolean inputRecognized = ordered.stream()
                .anyMatch(p -> !COMMON_PACK.equals(p.packKey()) && weight(p, inputHay) > 0);
        String recent = inputRecognized ? input : join(input, sessionContext);
        return route(ordered, contextPage, recent);
    }

    /**
     * 选包。
     *
     * @param packs       全部包（调用方已按注册顺序排好）
     * @param contextPage 载体上报的入口页面，只用于路由（设计文档 §5.2：它绝不参与权限判定）
     * @param recentText  本轮用户原话 + 最近一轮助手正文 —— 追问（「那把它出库」）靠它才认得出域
     */
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
            log.debug("[ai-route] 无命中，保守全包下发（{} 个包）", ordered.size());
            return ordered;
        }
        // 命中的包按命中词数从多到少排；同分保持注册顺序（List.sort 是稳定的）
        List<AiToolPack> ranked = new ArrayList<>(hit);
        ranked.sort(Comparator.comparingInt((AiToolPack p) -> weight(p, hay)).reversed());

        int keep = Math.max(1, MAX_PACKS_PER_TURN - common.size());
        List<AiToolPack> chosen = new ArrayList<>(ranked.subList(0, Math.min(keep, ranked.size())));
        chosen.addAll(common);
        if (chosen.size() < ordered.size()) {
            log.debug("[ai-route] 命中 {} 个包，收窄到 {} 个：{}", hit.size(), chosen.size(),
                    chosen.stream().map(AiToolPack::packKey).toList());
        } else {
            log.debug("[ai-route] 命中 {} 个包（未超上限），全带", chosen.size());
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
     * —— 不归一化就永远匹配不上，那个页面上的「有什么要办的」只会拿到另一个包。
     * 同时抹掉空格与中缀点，让「领用单 / 出库」这类写法也能命中。
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
