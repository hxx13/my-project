package com.example.demo.modules.ai.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.bootstrap.AiCopyConfigStore;
import com.example.demo.modules.ai.bootstrap.AiDrawerCopySeed;
import com.example.demo.modules.ai.bootstrap.AiDrawerWriteStore;
import com.example.demo.modules.ai.bootstrap.AiDrawerWriteStore.CapabilityItem;
import com.example.demo.modules.auth.entity.User;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * {@link AiDrawerWriteService} 的五类契约（假口子 / 假仓储，不连 Spring 上下文）：
 * ① 非超管两个接口都拒；② 超管存文案只写白名单键；③ 越界键整批拒、一个都不写；
 * ④ 能力清单新增/改/删/排序；⑤ 空标题/空提示词被拒。
 */
class AiDrawerWriteServiceTest {

    /** 记账假文案仓储：记住每次写了哪些键、写成什么，并可预置旧值。 */
    private static final class FakeCopyStore implements AiCopyConfigStore {
        final Map<String, String> values = new LinkedHashMap<>();
        final List<String> writtenKeys = new ArrayList<>();

        @Override
        public boolean upsertDef(String module, String key, String label, String desc, String defVal) {
            throw new UnsupportedOperationException("写接口不碰定义表");
        }

        @Override
        public boolean upsertValue(String module, String key, String value) {
            writtenKeys.add(key);
            boolean inserted = !values.containsKey(key);
            values.put(key, value);
            return inserted;
        }

        @Override
        public Map<String, String> readValues(String module) {
            return new LinkedHashMap<>(values);
        }
    }

    /** 记账假能力仓：内存里维护全部行，id 自增；排序按 sort_order, id 与真实 SQL 同口径。 */
    private static final class FakeWriteStore implements AiDrawerWriteStore {
        final Map<Long, CapabilityItem> rows = new LinkedHashMap<>();
        final List<String> audits = new ArrayList<>();
        private long seq = 100;

        void seed(long id, String group, String title, String text, int sort) {
            rows.put(id, new CapabilityItem(id, group, title, text, "", sort, true, ""));
            seq = Math.max(seq, id);
        }

        @Override
        public List<CapabilityItem> selectAllOrdered() {
            List<CapabilityItem> out = new ArrayList<>(rows.values());
            out.sort(Comparator
                    .comparingInt((CapabilityItem c) -> c.sortOrder() == null ? 0 : c.sortOrder())
                    .thenComparingLong(CapabilityItem::id));
            return out;
        }

        @Override
        public long insert(CapabilityItem it) {
            long id = ++seq;
            rows.put(id, new CapabilityItem(id, it.groupName(), it.title(), it.promptText(), it.note(),
                    it.sortOrder(), it.enabled(), it.audience()));
            return id;
        }

        @Override
        public int update(CapabilityItem it) {
            if (!rows.containsKey(it.id())) {
                return 0;
            }
            rows.put(it.id(), it);
            return 1;
        }

        @Override
        public int deleteByIds(Collection<Long> ids) {
            int n = 0;
            for (Long id : ids) {
                if (rows.remove(id) != null) {
                    n++;
                }
            }
            return n;
        }

        @Override
        public void insertAudit(String module, String key, String oldValue, String newValue, String operatorId) {
            audits.add(module + "|" + key + "|" + oldValue + "|" + newValue + "|" + operatorId);
        }

        List<String> titles() {
            List<String> t = new ArrayList<>();
            for (CapabilityItem c : selectAllOrdered()) {
                t.add(c.title());
            }
            return t;
        }
    }

    private static User user(String id, RoleEnum role) {
        User u = new User();
        u.setId(id);
        u.setRole(role);
        return u;
    }

    private static CapabilityItem item(Long id, String group, String title, String prompt, int sort) {
        return new CapabilityItem(id, group, title, prompt, "", sort, true, "");
    }

    // ① 非超管（MEMBER/STAFF/ADMIN）调两个接口都被明确拒，且一个字节都没写
    @Test
    void 非超管_两个接口都拒_且不写任何东西() {
        for (RoleEnum role : List.of(RoleEnum.MEMBER, RoleEnum.STAFF, RoleEnum.ADMIN)) {
            FakeCopyStore copy = new FakeCopyStore();
            FakeWriteStore write = new FakeWriteStore();
            AiDrawerWriteService svc = new AiDrawerWriteService(copy, write);
            User actor = user("u-" + role, role);

            assertThrows(IllegalStateException.class,
                    () -> svc.saveCopy(actor, Map.of("ai.copy.detail.title", "改一下")),
                    role + " 不该能改文案");
            assertThrows(IllegalStateException.class,
                    () -> svc.saveCapabilities(actor, List.of(item(null, "g", "t", "p", 1))),
                    role + " 不该能改能力清单");

            assertTrue(copy.writtenKeys.isEmpty(), role + " 越权却写了文案");
            assertTrue(write.rows.isEmpty(), role + " 越权却写了能力");
            assertTrue(write.audits.isEmpty(), role + " 越权却写了审计");
        }
    }

    // 超管能过（含更高的平台所有者）
    @Test
    void 超管及以上能过() {
        for (RoleEnum role : List.of(RoleEnum.SUPER_ADMIN, RoleEnum.PLATFORM_OWNER)) {
            FakeCopyStore copy = new FakeCopyStore();
            AiDrawerWriteService svc = new AiDrawerWriteService(copy, new FakeWriteStore());
            int n = svc.saveCopy(user("s", role), Map.of("ai.copy.detail.title", "甲"));
            assertEquals(1, n, role + " 应放行");
        }
    }

    // ② 超管存文案成功，且只写白名单里的键；每键一条审计
    @Test
    void 超管存文案_只写白名单键() {
        FakeCopyStore copy = new FakeCopyStore();
        FakeWriteStore write = new FakeWriteStore();
        AiDrawerWriteService svc = new AiDrawerWriteService(copy, write);

        String k1 = "ai.copy.detail.title";
        String k2 = "ai.copy.detail.desc";
        Map<String, String> body = new LinkedHashMap<>();
        body.put(k1, "我能帮你做这些");
        body.put(k2, "点一句话即可填入");

        int n = svc.saveCopy(user("s-1", RoleEnum.SUPER_ADMIN), body);

        assertEquals(2, n);
        assertEquals(Set.of(k1, k2), new HashSet<>(copy.writtenKeys), "只该写白名单里的这两个键");
        assertEquals("我能帮你做这些", copy.values.get(k1));
        assertEquals("点一句话即可填入", copy.values.get(k2));
        assertEquals(2, write.audits.size(), "每键一条审计");
        assertTrue(write.audits.get(0).startsWith(AiDrawerCopySeed.MODULE + "|"), "审计模块口径");
    }

    // 空串 = 恢复默认：写回 null（读取侧 hasText 判空后回落代码默认）
    @Test
    void 空串恢复默认_写回null() {
        FakeCopyStore copy = new FakeCopyStore();
        copy.values.put("ai.copy.detail.title", "旧的自定义");
        AiDrawerWriteService svc = new AiDrawerWriteService(copy, new FakeWriteStore());

        svc.saveCopy(user("s", RoleEnum.SUPER_ADMIN), Map.of("ai.copy.detail.title", "  "));

        assertEquals(null, copy.values.get("ai.copy.detail.title"), "空串应写回 null（恢复默认）");
    }

    // ③ 提交含白名单外的键 → 整批拒，一个键都没写
    @Test
    void 越界键_整批拒_一个都不写() {
        FakeCopyStore copy = new FakeCopyStore();
        copy.values.put("ai.copy.detail.title", "原值");
        FakeWriteStore write = new FakeWriteStore();
        AiDrawerWriteService svc = new AiDrawerWriteService(copy, write);

        Map<String, String> body = new LinkedHashMap<>();
        body.put("ai.copy.detail.title", "改了");   // 合法
        body.put("ai.prompt.global", "非法键");      // 越界

        assertThrows(IllegalArgumentException.class,
                () -> svc.saveCopy(user("s", RoleEnum.SUPER_ADMIN), body));

        assertTrue(copy.writtenKeys.isEmpty(), "整批拒时一个键都不许写");
        assertEquals("原值", copy.values.get("ai.copy.detail.title"), "合法键也不许被写");
        assertTrue(write.audits.isEmpty(), "整批拒时不该有审计");
    }

    // ④-a 能力清单：新增
    @Test
    void 能力清单_新增() {
        FakeWriteStore write = new FakeWriteStore();
        AiDrawerWriteService svc = new AiDrawerWriteService(new FakeCopyStore(), write);

        List<CapabilityItem> saved = svc.saveCapabilities(user("s", RoleEnum.SUPER_ADMIN),
                List.of(item(null, "甲组", "新条", "新问法", 10)));

        assertEquals(1, saved.size());
        assertEquals("新条", saved.get(0).title());
        assertEquals("新问法", saved.get(0).promptText());
        assertTrue(saved.get(0).id() != null, "新增应拿到生成的 id");
    }

    // ④-b 能力清单：修改
    @Test
    void 能力清单_修改() {
        FakeWriteStore write = new FakeWriteStore();
        write.seed(7L, "甲组", "旧标题", "旧问法", 10);
        AiDrawerWriteService svc = new AiDrawerWriteService(new FakeCopyStore(), write);

        List<CapabilityItem> saved = svc.saveCapabilities(user("s", RoleEnum.SUPER_ADMIN),
                List.of(new CapabilityItem(7L, "甲组", "新标题", "新问法", "新备注", 20, false, "STAFF")));

        assertEquals(1, saved.size());
        CapabilityItem got = saved.get(0);
        assertEquals(7L, got.id(), "id 不变");
        assertEquals("新标题", got.title());
        assertEquals(20, got.sortOrder());
        assertEquals(Boolean.FALSE, got.enabled());
        assertEquals("STAFF", got.audience());
    }

    // ④-c 能力清单：删除（提交里没有的 id 即删）
    @Test
    void 能力清单_删除() {
        FakeWriteStore write = new FakeWriteStore();
        write.seed(1L, "甲组", "留下", "t", 10);
        write.seed(2L, "甲组", "删掉", "t", 20);
        AiDrawerWriteService svc = new AiDrawerWriteService(new FakeCopyStore(), write);

        List<CapabilityItem> saved = svc.saveCapabilities(user("s", RoleEnum.SUPER_ADMIN),
                List.of(new CapabilityItem(1L, "甲组", "留下", "t", "", 10, true, "")));

        assertEquals(List.of("留下"), write.titles(), "提交里没有的 id 应被删除");
        assertEquals(1, saved.size());
    }

    // ④-d 能力清单：排序（提交整份新顺序，含并列号由 id 兜底）
    @Test
    void 能力清单_排序_并列号稳定() {
        FakeWriteStore write = new FakeWriteStore();
        write.seed(1L, "甲组", "甲", "t", 10);
        write.seed(2L, "甲组", "乙", "t", 20);
        write.seed(3L, "甲组", "丙", "t", 30);
        AiDrawerWriteService svc = new AiDrawerWriteService(new FakeCopyStore(), write);

        // 把「丙」提到最前；甲、乙并列同号（都=50）—— 同级按 id 兜底，甲(id1)在乙(id2)前
        List<CapabilityItem> saved = svc.saveCapabilities(user("s", RoleEnum.SUPER_ADMIN), List.of(
                new CapabilityItem(3L, "甲组", "丙", "t", "", 1, true, ""),
                new CapabilityItem(1L, "甲组", "甲", "t", "", 50, true, ""),
                new CapabilityItem(2L, "甲组", "乙", "t", "", 50, true, "")));

        assertEquals(List.of("丙", "甲", "乙"), write.titles(), "按 sort_order 升序，并列按 id 稳定");
        assertEquals(List.of("丙", "甲", "乙"), saved.stream().map(CapabilityItem::title).toList());
    }

    // 删除用整份保存一次完成：既有改也有删也有增
    @Test
    void 能力清单_增改删一次提交() {
        FakeWriteStore write = new FakeWriteStore();
        write.seed(1L, "甲组", "留着改", "t", 10);
        write.seed(2L, "甲组", "删掉", "t", 20);
        AiDrawerWriteService svc = new AiDrawerWriteService(new FakeCopyStore(), write);

        List<CapabilityItem> saved = svc.saveCapabilities(user("s", RoleEnum.SUPER_ADMIN), List.of(
                new CapabilityItem(1L, "甲组", "改过", "t2", "", 10, true, ""),   // 改
                item(null, "乙组", "新增", "t3", 30)));                       // 增；id=2 不在 → 删

        assertEquals(List.of("改过", "新增"), write.titles());
        assertEquals(2, saved.size());
    }

    // ⑤ 空标题 / 空提示词被拒
    @Test
    void 空标题或空提示词被拒() {
        FakeWriteStore write = new FakeWriteStore();
        AiDrawerWriteService svc = new AiDrawerWriteService(new FakeCopyStore(), write);
        User actor = user("s", RoleEnum.SUPER_ADMIN);

        assertThrows(IllegalArgumentException.class,
                () -> svc.saveCapabilities(actor, List.of(item(null, "g", "   ", "提示", 1))));
        assertThrows(IllegalArgumentException.class,
                () -> svc.saveCapabilities(actor, List.of(item(null, "g", "标题", "", 1))));
        assertThrows(IllegalArgumentException.class,
                () -> svc.saveCapabilities(actor, List.of(item(null, "g", null, "提示", 1))));

        assertTrue(write.rows.isEmpty(), "校验失败不该落库");
    }

    // 校验失败不许半写：一好一坏同批 → 一条都不写
    @Test
    void 校验失败_一条都不写() {
        FakeWriteStore write = new FakeWriteStore();
        AiDrawerWriteService svc = new AiDrawerWriteService(new FakeCopyStore(), write);

        assertThrows(IllegalArgumentException.class, () -> svc.saveCapabilities(
                user("s", RoleEnum.SUPER_ADMIN),
                List.of(item(null, "g", "好条", "提示", 1), item(null, "g", "", "提示", 2))));

        assertTrue(write.rows.isEmpty(), "同批有非法条时整批不落库");
    }

    // 文案空批 / 能力空批：明确报错，不静默成功
    @Test
    void 空提交被拒() {
        AiDrawerWriteService svc = new AiDrawerWriteService(new FakeCopyStore(), new FakeWriteStore());
        User actor = user("s", RoleEnum.SUPER_ADMIN);
        assertThrows(IllegalArgumentException.class, () -> svc.saveCopy(actor, Map.of()));
        assertThrows(IllegalArgumentException.class, () -> svc.saveCopy(actor, null));
        assertThrows(IllegalArgumentException.class, () -> svc.saveCapabilities(actor, null));
    }

    // ⑥ 已有行（带 id）请求里没给 enabled/audience → 保留库里原值，不按默认覆盖（防静默丢数据）
    @Test
    void 已有行_缺列保留库里原值() {
        FakeWriteStore write = new FakeWriteStore();
        write.rows.put(7L, new CapabilityItem(7L, "甲组", "旧标题", "旧问法", "旧备注", 10, Boolean.FALSE, "STUDENT"));
        AiDrawerWriteService svc = new AiDrawerWriteService(new FakeCopyStore(), write);

        // 只给 id/分组/标题/提示/排序，enabled 与 audience 传 null（=请求里没给）
        List<CapabilityItem> saved = svc.saveCapabilities(user("s", RoleEnum.SUPER_ADMIN),
                List.of(new CapabilityItem(7L, "甲组", "新标题", "新问法", null, 20, null, null)));

        CapabilityItem got = saved.get(0);
        assertEquals("新标题", got.title(), "给的列照常更新");
        assertEquals(Boolean.FALSE, got.enabled(), "带 id 不传 enabled → 保留库里的 false（不得重置为启用）");
        assertEquals("STUDENT", got.audience(), "带 id 不传 audience → 保留库里的 STUDENT（不得重置为全员）");
        assertEquals("旧备注", got.note(), "带 id 不传备注 → 保留库里的原备注（不得被清空）");
    }

    // ⑦ 新建行（无 id）请求里没给 enabled/audience → 用默认（启用 / 全员）
    @Test
    void 新建行_缺列用默认() {
        FakeWriteStore write = new FakeWriteStore();
        AiDrawerWriteService svc = new AiDrawerWriteService(new FakeCopyStore(), write);

        List<CapabilityItem> saved = svc.saveCapabilities(user("s", RoleEnum.SUPER_ADMIN),
                List.of(new CapabilityItem(null, "甲组", "新条", "新问法", "新条备注", 10, null, null)));

        CapabilityItem got = saved.get(0);
        assertEquals(Boolean.TRUE, got.enabled(), "新建行缺 enabled → 默认启用");
        assertEquals("", got.audience(), "新建行缺 audience → 默认全员");
    }
}
