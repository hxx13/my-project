package com.example.demo.modules.ai.tool;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * L2 路由的闸。
 *
 * <p>钉住三件事：
 * ① <b>挑不出就全给</b> —— 路由是体验层，绝不能变成「用户办不了事」的功能开关；
 * ② 命中少的包该被收窄（这才是它存在的理由：§6.3 的「这一轮只有 8 个」）；
 * ③ <b>输出顺序恒等于注册顺序</b> —— 顺序一漂，prompt 缓存前缀全失效（§10.2）。
 *
 * <p>用假包而不是真包：真包会随业务增长而增删，这条测试要盯的是**路由规则**，不是某个域的词汇表。
 * 假包的顺序刻意与注册表一致（按 packKey 字母序）—— 真跑时 {@link ToolRegistry} 就是这么排的。
 */
class AiPackRouterTest {

    private final AiPackRouter router = new AiPackRouter();

    private static AiToolPack pack(String key, String name, String... hints) {
        return new AiToolPack() {
            @Override
            public String packKey() {
                return key;
            }

            @Override
            public String displayName() {
                return name;
            }

            @Override
            public String defaultPrompt() {
                return "";
            }

            @Override
            public List<AiTool> tools() {
                return List.of();
            }

            @Override
            public Set<String> routeHints() {
                return Set.of(hints);
            }
        };
    }

    private List<AiToolPack> all() {
        return List.of(
                pack("cageQuery", "笼架查询", "笼架", "房间"),
                pack("common", "公共查询", "人员", "课题组"),
                pack("door", "门禁通道控制", "门禁", "常开", "闸机"),
                pack("portalContent", "门户内容", "门户", "资讯", "新闻", "公告", "通知", "content-manager"),
                pack("review", "学生审核", "申领", "待审", "驳回"),
                pack("supplies", "物资选购", "商城", "加购", "领用"),
                pack("suppliesProcess", "物资处理", "领用单", "出库", "待处理"),
                pack("telemetry", "环境监测", "温湿度", "湿度", "温度", "压差", "告警", "楼层"),
                pack("unfreeze", "门禁免冻", "免冻", "豁免", "冻结"));
    }

    /* 加了门户内容包之后，上面这组假包一共 9 个（> 上限 4），所以下面的期望值都按"会收窄"来算。 */

    @Test
    @DisplayName("一句都认不出 → 全给（宁可多带，也不能让用户办不了事）")
    void unmatchedMeansEverything() {
        List<AiToolPack> out = router.route(all(), "/console/admin", "嗯，你看着办吧");
        assertEquals(9, out.size());
    }

    @Test
    @DisplayName("命中一个域 → 只带它 + 公共包（这才是「这一轮只有几个工具」）")
    void oneHitNarrowsToOnePackPlusCommon() {
        List<AiToolPack> out = router.route(all(), null, "有哪些单子要出库");

        assertEquals(List.of("common", "suppliesProcess"), keys(out));
    }

    @Test
    @DisplayName("入口页面也算路由词（英文 key 直接命中路径）")
    void contextPageRoutes() {
        List<AiToolPack> out = router.route(all(), "/console/admin/door-control", "");
        assertEquals(List.of("common", "door"), keys(out));
    }

    @Test
    @DisplayName("站在内容管理页说「帮我发个通知」→ 门户内容包必须带上（真机就是这儿漏的）")
    void portalPackRoutedByPageAndByWord() {
        // ① 靠**页面**（用户的实际场景：人就在那一页上）。路径里的 / 与 - 都会被抹掉，
        //    所以英文段是 contentmanager，中文词一个都命中不了 —— 词表里必须留这个英文段。
        List<AiToolPack> byPage = router.route(all(), "/content-manager/content", "帮我发个通知");
        assertTrue(keys(byPage).contains("portalContent"), "页面信号没接上：" + keys(byPage));

        // ② 光靠词也得命中：不在那一页时，用户照样会说「发个通知」
        List<AiToolPack> byWord = router.route(all(), null, "帮我发个通知");
        assertTrue(keys(byWord).contains("portalContent"),
                "「通知」是用户最自然的说法，词表里必须有 —— 2026-10-08 真机就因为这个字缺失，"
                        + "模型手里连发布工具都没有，回了「我做不到」：" + keys(byWord));
    }

    @Test
    @DisplayName("路径里的 / 也算分隔符：/supplies/process 要能命中包名 suppliesProcess")
    void pathSeparatorsAreFlattened() {
        List<AiToolPack> out = router.route(all(), "/console/admin/supplies/process", "");

        assertTrue(keys(out).contains("suppliesProcess"),
                "不归一化分隔符就永远匹配不上，那个页面上的「有什么要办的」只会拿到另一个包：" + keys(out));
    }

    @Test
    @DisplayName("跨两三个域的一句话 → 一次全带，不切碎")
    void crossDomainStaysTogether() {
        List<AiToolPack> out = router.route(all(), null, "把张立帅的免冻开了，再帮他领个水桶加购物车");

        assertEquals(List.of("common", "supplies", "unfreeze"), keys(out));
    }

    @Test
    @DisplayName("命中太多（词写太宽）→ 按命中词数收窄到上限，公共包保底，顺序不变")
    void capsWhenTooManyHit() {
        List<AiToolPack> out = router.route(all(), null,
                "笼架 房间 人员 课题组 门禁 常开 闸机 门户 资讯 新闻 公告 申领 待审 驳回 商城 加购 领用"
                        + " 领用单 出库 待处理 温湿度 压差 告警 免冻 豁免 冻结");
        List<String> ks = keys(out);

        assertEquals(AiPackRouter.MAX_PACKS_PER_TURN, ks.size(), "上限是包数，不能任其膨胀");
        assertEquals("common", ks.get(0), "公共包永远排在最前（注册顺序）");
        assertTrue(!ks.contains("cageQuery"), "命中词最少的（笼架/房间 = 2）先落选：" + ks);
        // 命中词数：portalContent 4（门户/资讯/新闻/公告）；telemetry 4（温湿度/湿度 **重叠命中** + 压差/告警）；
        // door / review / supplies / unfreeze 各 3；suppliesProcess 与 unfreeze 同为 3 但排在后面 → 收窄时落选。
        // 取前 5 + 公共包 = 6；输出顺序恒等于注册顺序。
        assertEquals(List.of("common", "door", "portalContent", "review", "supplies", "telemetry"), ks);
    }

    @Test
    @DisplayName("包数本来就不超上限 → 原样返回，不做无谓筛选")
    void smallRegistryPassesThrough() {
        List<AiToolPack> three = List.of(
                pack("common", "公共查询"), pack("door", "门禁通道控制"), pack("telemetry", "环境监测"));
        assertEquals(three, router.route(three, null, "温湿度怎么样"));
    }

    @Test
    @DisplayName("当轮原话命中时，历史正文不许把它挤掉 —— 助手列过能力清单也不许")
    void currentInputBeatsHistoryInRouting() {
        List<AiToolPack> packs = all();
        // 真实发生过的助手正文：它解释「什么办不了」时把自己能办的域挨个念了一遍
        String history = "你能查笼架目录、待审清单、商城物资、购物车、领用单、门禁通道、免冻豁免、门户内容这些";
        List<AiToolPack> out = router.routeForTurn(packs, null, "查询一下2楼的湿度情况", history);
        assertEquals(List.of("common", "telemetry"), keys(out),
                "当轮问的是湿度，历史里那一串域不许参与投票 —— 否则包位被占满，答成「我没有环境监测工具」："
                        + keys(out));
    }

    private static List<String> keys(List<AiToolPack> packs) {
        return packs.stream().map(AiToolPack::packKey).toList();
    }
}
