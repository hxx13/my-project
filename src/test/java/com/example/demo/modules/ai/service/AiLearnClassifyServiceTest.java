package com.example.demo.modules.ai.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 归类那一步的两道闸。
 *
 * <p><b>① 安全闸</b>：这一步是全链路里唯一让模型「改写」用户数据的地方，
 * 工具名只能在输入给过的集合里挑。模型编出来的工具名若被放进去，就等于让一次幻觉
 * 变成提示词里的「用户常用说法 → 某工具」。
 *
 * <p><b>② 次数闸</b>：次数是影子期判定的分母，算错会让门槛失效 —— 这两种错都实跑撞过：
 * 累加 → 多跑几遍次数就虚增、全部越线转正；不继承 → 换个短说法次数掉回 1、被打回观察中。
 */
class AiLearnClassifyServiceTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Set<String> ALLOWED = Set.of("listSupplies", "screenshotPage");

    private static String k(String phrase, String target) {
        return phrase + AiLearnClassifyService.SEP + target;
    }

    private static final Map<String, Integer> HITS = Map.of(
            k("胶棉拖把的出入库流水给我看看", "listSupplies"), 2,
            k("拖把流水", "listSupplies"), 3);

    @Test
    @DisplayName("模型编出来的工具名整条丢弃 —— 它碰不到没给过它的工具")
    void dropsInventedTarget() {
        String raw = """
                [
                  {"target":"listSupplies","phrase":"拖把流水","from":["胶棉拖把的出入库流水给我看看"]},
                  {"target":"deleteEverything","phrase":"删库","from":["删库"]}
                ]
                """;

        List<AiLearnClassifyService.Group> groups = read(raw);

        assertEquals(1, groups.size(), "编出来的工具名必须被丢掉");
        assertEquals("listSupplies", groups.get(0).target());
    }

    @Test
    @DisplayName("过长的短说法丢掉 —— 没压成短句就等于没归类")
    void dropsOverLongPhrase() {
        String raw = """
                [
                  {"target":"listSupplies","phrase":"这个短说法是被故意写得特别长特别长特别长的","from":[]},
                  {"target":"screenshotPage","phrase":"截图","from":[]}
                ]
                """;

        List<AiLearnClassifyService.Group> groups = read(raw);

        assertEquals(1, groups.size());
        assertEquals("截图", groups.get(0).phrase());
    }

    @Test
    @DisplayName("合并后的次数**取最大、不累加** —— 累加会越跑越大，把「够 5 次才转正」这道闸冲垮")
    void mergedHitsTakeMaxNotSum() {
        String raw = """
                [{"target":"listSupplies","phrase":"拖把流水","from":["胶棉拖把的出入库流水给我看看","拖把流水"]}]
                """;

        List<AiLearnClassifyService.Group> groups = read(raw);

        assertEquals(3, groups.get(0).hits(), "来源里最大的是 3，不该加成 5");
    }

    @Test
    @DisplayName("同一个来源列两遍不翻倍")
    void duplicateSourcesDoNotDouble() {
        String raw = """
                [{"target":"listSupplies","phrase":"拖把流水","from":["拖把流水","拖把流水"]}]
                """;

        assertEquals(3, read(raw).get(0).hits());
    }

    @Test
    @DisplayName("换了短说法要**继承原次数** —— 否则改名那一刻被打回观察中，之前攒的证据白费")
    void renameInheritsHits() {
        Map<String, Integer> hits = Map.of(k("监测点温湿度", "screenshotPage"), 4);
        String raw = """
                [{"target":"screenshotPage","phrase":"页面截图","from":["监测点温湿度"]}]
                """;

        List<AiLearnClassifyService.Group> groups;
        try {
            groups = AiLearnClassifyService.parseGroups(raw, MAPPER, ALLOWED, hits);
        } catch (Exception e) {
            throw new AssertionError(e);
        }

        assertEquals(4, groups.get(0).hits(), "改名的这条要接着用原来的证据");
    }

    @Test
    @DisplayName("输出不是 JSON / 被围栏包着 —— 取不到就返回空，调用方据此保持原批次不动")
    void toleratesFencesButRejectsGarbage() {
        assertTrue(read("模型今天不想干活").isEmpty());
        assertTrue(read("```json\n[{\"target\":\"listSupplies\",\"phrase\":\"库存\",\"from\":[]}]\n```").size() == 1,
                "被 ``` 围栏包着也要能读出来");
    }

    private static List<AiLearnClassifyService.Group> read(String raw) {
        try {
            return AiLearnClassifyService.parseGroups(raw, MAPPER, ALLOWED, HITS);
        } catch (Exception e) {
            throw new AssertionError(e);
        }
    }
}
