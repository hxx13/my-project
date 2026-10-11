package com.example.demo.modules.ai.bootstrap;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * {@link AiDrawerCopySeed} 的写入策略，用记账假仓储验证（不连库）：
 * <ul>
 *   <li>缺键 → 种默认值；</li>
 *   <li>键已存在（管理员改过、或写成 NULL 表示恢复默认）→ 值一个字节都不动；</li>
 *   <li>某条键抛异常 → 逐键隔离，后面的键照常处理；</li>
 *   <li>汇总计数与实况一致。</li>
 * </ul>
 */
class AiDrawerCopySeedTest {

    /** 记账假仓储：按 (module|key) 存行；可预置值证明没被覆盖，可指定某键必抛异常。 */
    private static final class FakeStore implements AiCopyConfigStore {
        final Map<String, String> defs = new LinkedHashMap<>();
        final Map<String, String> values = new LinkedHashMap<>();
        final List<String> writtenKeys = new ArrayList<>();
        int defInserts;
        int valueInserts;
        /** 值写入次数（含覆盖）；用来证明已存在的键连写都没写。 */
        int valueWrites;

        /** 非空时，跑这个键就抛异常（模拟某条键坏掉）。 */
        String throwOnKey;

        FakeStore seedValue(String module, String key, String val) {
            values.put(module + "|" + key, val);
            return this;
        }

        private boolean put(Map<String, String> table, String module, String key, String val) {
            writtenKeys.add(key);
            String id = module + "|" + key;
            boolean inserted = !table.containsKey(id);
            table.put(id, val);
            return inserted;
        }

        @Override
        public boolean upsertDef(String module, String key, String label, String desc, String defVal) {
            if (key.equals(throwOnKey)) throw new IllegalStateException("boom:" + key);
            boolean ins = put(defs, module, key, defVal);
            if (ins) defInserts++;
            return ins;
        }

        @Override
        public boolean upsertValue(String module, String key, String value) {
            valueWrites++;
            boolean ins = put(values, module, key, value);
            if (ins) valueInserts++;
            return ins;
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
    }

    private static int keyCount() {
        return AiDrawerCopySeed.COPIES.size();
    }

    private static String key(int i) {
        return AiDrawerCopySeed.COPIES.get(i).key();
    }

    @Test
    void 缺键才种默认值_已存在的键值不被改写() {
        // 预置：第 0 条被改成明显不同的值；第 1 条写成 NULL（表示「恢复默认」）。
        FakeStore store = new FakeStore()
                .seedValue(AiDrawerCopySeed.MODULE, key(0), "PROBE_KEEP_ME")
                .seedValue(AiDrawerCopySeed.MODULE, key(1), null);
        AiDrawerCopySeed seed = new AiDrawerCopySeed(store);

        AiDrawerCopySeed.Outcome o = seed.seed();

        // 核心：改过的值与 NULL 值都原样保留，没被默认值覆盖。
        assertEquals("PROBE_KEEP_ME", store.values.get(AiDrawerCopySeed.MODULE + "|" + key(0)),
                "管理员改过的值必须扛得住播种");
        assertNull(store.values.get(AiDrawerCopySeed.MODULE + "|" + key(1)),
                "写成 NULL 的「恢复默认」也必须保留");
        // 缺的键都种上了默认值。
        assertEquals(AiDrawerCopySeed.COPIES.get(2).value(),
                store.values.get(AiDrawerCopySeed.MODULE + "|" + key(2)), "缺键种上默认值");
        assertEquals(2, o.kept(), "两条已存在 → 保留 2");
        assertEquals(keyCount() - 2, o.added(), "其余全新增");
        assertEquals(0, o.failed(), "无失败");
        // 已存在的键连值写都没写：valueWrites 恰等于新增条数（不是 keyCount）。
        assertEquals(keyCount() - 2, store.valueWrites, "已存在的键不该触发任何值写入");
    }

    @Test
    void 定义行每次都更新_但值表只有缺键才写() {
        FakeStore store = new FakeStore();
        AiDrawerCopySeed seed = new AiDrawerCopySeed(store);

        AiDrawerCopySeed.Outcome o1 = seed.seed();
        assertEquals(keyCount(), store.defs.size(), "首跑：每键一行定义");
        assertEquals(keyCount(), store.values.size(), "首跑：每键一行运行值");
        assertEquals(keyCount(), o1.added(), "首跑全部新增");
        assertEquals(0, o1.kept(), "首跑无保留");

        int valueWritesAfterFirst = store.valueWrites;
        AiDrawerCopySeed.Outcome o2 = seed.seed();
        assertEquals(keyCount(), store.defs.size(), "二跑：定义行数不变");
        assertEquals(keyCount(), store.values.size(), "二跑：值行数不变");
        assertEquals(keyCount(), store.defInserts, "定义行仍在每跑更新（插入仍只有首次那批）");
        assertEquals(0, o2.added(), "二跑无新增");
        assertEquals(keyCount(), o2.kept(), "二跑全部已存在 → 全保留");
        assertEquals(valueWritesAfterFirst, store.valueWrites, "二跑对值表零写入");
    }

    @Test
    void 某条键抛异常_后面的键照常处理() {
        FakeStore store = new FakeStore();
        store.throwOnKey = key(1); // 第 2 条坏掉
        AiDrawerCopySeed seed = new AiDrawerCopySeed(store);

        AiDrawerCopySeed.Outcome o = seed.seed();

        assertEquals(1, o.failed(), "恰有一条失败");
        // 第 2 条：定义与值都没落。
        assertFalse(store.defs.containsKey(AiDrawerCopySeed.MODULE + "|" + key(1)), "坏键的定义没写进去");
        assertFalse(store.values.containsKey(AiDrawerCopySeed.MODULE + "|" + key(1)), "坏键的值没写进去");
        // 第 3 条（坏键之后）仍然被处理 —— 证明逐键隔离。
        assertEquals(AiDrawerCopySeed.COPIES.get(2).value(),
                store.values.get(AiDrawerCopySeed.MODULE + "|" + key(2)), "坏键后面的键照样播种");
        assertEquals(keyCount() - 1, o.added(), "除坏键外全部新增");
    }

    @Test
    void 只写_ai_copy_前缀的键() {
        assertFalse(AiDrawerCopySeed.COPIES.isEmpty(), "写入清单不能为空");
        for (AiDrawerCopySeed.Copy c : AiDrawerCopySeed.COPIES) {
            assertTrue(c.key().startsWith(AiDrawerCopySeed.PREFIX), "清单里混入越界键: " + c.key());
        }
        FakeStore store = new FakeStore();
        new AiDrawerCopySeed(store).run(null);
        for (String k : store.writtenKeys) {
            assertTrue(k.startsWith(AiDrawerCopySeed.PREFIX), "写到了非 ai.copy. 键: " + k);
        }
    }
}
