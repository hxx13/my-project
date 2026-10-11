package com.example.demo.modules.ai.bootstrap;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * {@link AiCapabilityPromptSeed} 的三条不变量，用记账假仓储验证（不连库）：
 * ① 没标记且表空 → 写全部条目 + 落标记；② 有标记 → 一条都不写；③ 表非空但无标记 → 只落标记。
 */
class AiCapabilityPromptSeedTest {

    /** 记账假配置仓储：按 (module|key) 存值，可预置别的模块键来证明没被碰。 */
    private static final class FakeConfigStore implements AiCopyConfigStore {
        final Map<String, String> values = new LinkedHashMap<>();
        final List<String> writtenKeys = new ArrayList<>();

        FakeConfigStore seedValue(String module, String key, String val) {
            values.put(module + "|" + key, val);
            return this;
        }

        @Override
        public boolean upsertDef(String module, String key, String label, String desc, String defVal) {
            return false; // 播种不用定义表
        }

        @Override
        public boolean upsertValue(String module, String key, String value) {
            writtenKeys.add(key);
            String id = module + "|" + key;
            boolean inserted = !values.containsKey(id);
            values.put(id, value);
            return inserted;
        }

        @Override
        public Map<String, String> readValues(String module) {
            Map<String, String> out = new LinkedHashMap<>();
            String prefix = module + "|";
            for (Map.Entry<String, String> e : values.entrySet()) {
                if (e.getKey().startsWith(prefix)) {
                    out.put(e.getKey().substring(prefix.length()), e.getValue());
                }
            }
            return out;
        }

        boolean has(String module, String key) {
            return values.containsKey(module + "|" + key);
        }
    }

    /** 记账假条目仓储：只累加，数得清插了几条。 */
    private static final class FakeCapabilityStore implements AiCapabilityPromptSeedStore {
        final List<String> rows = new ArrayList<>();
        final List<String> audiences = new ArrayList<>();

        @Override
        public int countAll() {
            return rows.size();
        }

        @Override
        public void insert(String groupName, String title, String promptText, String note, int sortOrder, String audience) {
            rows.add(groupName + "|" + title + "|" + promptText + "|" + note + "|" + sortOrder + "|" + audience);
            audiences.add(audience);
        }
    }

    @Test
    void 没标记且表空_写入全部条目_并落标记() {
        FakeConfigStore config = new FakeConfigStore();
        FakeCapabilityStore caps = new FakeCapabilityStore();

        new AiCapabilityPromptSeed(config, caps).run(null);

        assertEquals(AiCapabilityPromptSeed.ENTRIES.size(), caps.rows.size(), "表空且无标记：应写入全部条目");
        assertTrue(config.has(AiCapabilityPromptSeed.MODULE, AiCapabilityPromptSeed.SEEDED_KEY), "应落播种标记");
        assertEquals(List.of(AiCapabilityPromptSeed.SEEDED_KEY), config.writtenKeys, "只该写标记这一个键");
    }

    @Test
    void 已播过_一条都不写_表被清空也不复活() {
        FakeConfigStore config = new FakeConfigStore()
                .seedValue(AiCapabilityPromptSeed.MODULE, AiCapabilityPromptSeed.SEEDED_KEY, "1");
        FakeCapabilityStore caps = new FakeCapabilityStore(); // 表被清空

        new AiCapabilityPromptSeed(config, caps).run(null);

        assertTrue(caps.rows.isEmpty(), "有标记就不写条目（表清空过也不复活）");
        assertTrue(config.writtenKeys.isEmpty(), "有标记时连标记键都不该再写");
    }

    @Test
    void 表非空但无标记_只落标记_不写条目() {
        FakeConfigStore config = new FakeConfigStore();
        FakeCapabilityStore caps = new FakeCapabilityStore();
        caps.insert("已有组", "已有条目", "已有问法", "", 1, null); // 表里已经有一行

        new AiCapabilityPromptSeed(config, caps).run(null);

        assertEquals(1, caps.rows.size(), "表非空：不再写初值，原有那行也不动");
        assertTrue(config.has(AiCapabilityPromptSeed.MODULE, AiCapabilityPromptSeed.SEEDED_KEY), "只补标记");
        assertEquals(List.of(AiCapabilityPromptSeed.SEEDED_KEY), config.writtenKeys, "只该写标记这一个键");
    }

    @Test
    void 播种不碰同模块的_prompt_与_copy_键() {
        FakeConfigStore config = new FakeConfigStore()
                .seedValue(AiCapabilityPromptSeed.MODULE, "ai.prompt.global", "原样")
                .seedValue(AiCapabilityPromptSeed.MODULE, "ai.copy.chat.stopped", "（已停止生成）");
        FakeCapabilityStore caps = new FakeCapabilityStore();

        new AiCapabilityPromptSeed(config, caps).run(null);

        assertEquals("原样", config.values.get(AiCapabilityPromptSeed.MODULE + "|ai.prompt.global"), "提示词键不得被改");
        assertEquals("（已停止生成）", config.values.get(AiCapabilityPromptSeed.MODULE + "|ai.copy.chat.stopped"), "文案键不得被改");
        for (String k : config.writtenKeys) {
            assertFalse(k.startsWith("ai.prompt.") || k.startsWith("ai.copy."), "写到了别模块键: " + k);
        }
    }

    @Test
    void 清单非空且同组排序号相邻递增() {
        assertFalse(AiCapabilityPromptSeed.ENTRIES.isEmpty(), "初值清单不能为空");
        List<Integer> orders = AiCapabilityPromptSeed.ENTRIES.stream()
                .map(AiCapabilityPromptSeed.Entry::sortOrder).toList();
        for (int i = 1; i < orders.size(); i++) {
            assertTrue(orders.get(i) > orders.get(i - 1), "排序号须全局严格递增");
        }
        for (AiCapabilityPromptSeed.Entry e : AiCapabilityPromptSeed.ENTRIES) {
            assertFalse(e.groupName().isBlank(), "分组名不能为空");
            assertTrue(e.promptText().length() <= 512, "prompt_text 超过列宽: " + e.title());
            assertTrue(e.title().length() <= 256, "title 超过列宽: " + e.title());
        }
    }

    /**
     * audience 只能是白名单里的取值（视角 STAFF/STUDENT、角色档 ADMIN/SUPER_ADMIN），空/null = 全员。
     * **必须与 {@code AiDrawerContentService#visibleTo} 的白名单一致** —— 写错的值会被按「全员」放行，
     * 等于把管理员条目铺给所有人。
     */
    @Test
    void 每条audience都在白名单内() {
        Set<String> allowed = Set.of("STAFF", "STUDENT", "ADMIN", "SUPER_ADMIN");
        for (AiCapabilityPromptSeed.Entry e : AiCapabilityPromptSeed.ENTRIES) {
            String a = e.audience();
            assertTrue(a == null || a.isBlank() || allowed.contains(a),
                    "audience 不在白名单: " + e.title() + " -> " + a);
        }
    }

    /**
     * 角色档只出现在「管理员」组，其余一律 STAFF。带档的条目普通人看不见，标错就是把人挡在门外；
     * 不带档的标成 STAFF 才不会被误伤。两边都要卡住，所以这里逐条对。
     */
    @Test
    void 角色档条目归管理员组_其余一律教职工() {
        for (AiCapabilityPromptSeed.Entry e : AiCapabilityPromptSeed.ENTRIES) {
            boolean tier = "ADMIN".equals(e.audience()) || "SUPER_ADMIN".equals(e.audience());
            if (tier) {
                assertEquals("管理员", e.groupName(), "带角色档的条目应归在管理员组: " + e.title());
            } else {
                assertEquals("STAFF", e.audience(), "不带角色档的条目一律教职工: " + e.title());
            }
        }
    }
}
