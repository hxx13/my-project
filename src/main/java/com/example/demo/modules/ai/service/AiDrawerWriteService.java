package com.example.demo.modules.ai.service;

import com.example.demo.modules.ai.bootstrap.AiCopyConfigStore;
import com.example.demo.modules.ai.bootstrap.AiDrawerCopySeed;
import com.example.demo.modules.ai.bootstrap.AiDrawerWriteStore;
import com.example.demo.modules.ai.bootstrap.AiDrawerWriteStore.CapabilityItem;
import com.example.demo.modules.ai.timer.service.AiTimerService;
import com.example.demo.modules.auth.entity.User;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * AI 对话抽屉内容（{@link AiDrawerContentService} 的只读面）的**写面**：保存文案、整份保存能力清单。
 *
 * <p>两个动作都**只有 ≥SUPER_ADMIN 能做**（判据复用 {@link AiTimerService#isSuper}，不另写一套）；
 * **拒就是拒**，抛异常由控制器转成明确错误，不静默成功。
 */
@Service
public class AiDrawerWriteService {

    private final AiCopyConfigStore copyStore;
    private final AiDrawerWriteStore writeStore;

    public AiDrawerWriteService(AiCopyConfigStore copyStore, AiDrawerWriteStore writeStore) {
        this.copyStore = copyStore;
        this.writeStore = writeStore;
    }

    /** 权限墙：≥SUPER_ADMIN（口径唯一来源 {@link AiTimerService#isSuper}）。 */
    private static void requireSuper(User actor, String action) {
        if (actor == null) {
            throw new IllegalStateException("未识别到操作人");
        }
        if (!AiTimerService.isSuper(actor)) {
            throw new IllegalStateException("只有超级管理员及以上能" + action);
        }
    }

    // ── ① 保存文案（逐键 upsert；键不在白名单 → 整批拒）──

    /**
     * 保存一批「键 → 新值」，**逐键 upsert**（复用 {@link AiCopyConfigStore#upsertValue}，
     * 它是文案唯一的写入口）。键必须落在 {@link AiDrawerCopySeed} 的白名单里；
     * **只要有一个键不在白名单，整批拒、一个键都不写**（不做部分成功）。每键写一条审计。
     *
     * <p><b>空值语义 = 恢复默认</b>：空串 / 空白 / {@code null} 一律写回 {@code NULL} 值，
     * 读取侧（{@code AiDrawerContentService.buildCopy}）用 {@code hasText} 判空后回落代码内置原文。
     * 写 NULL 而不是写死默认值本身，是为了让「默认」始终跟随代码（改了 {@code AiDrawerCopySeed} 的原文会自动跟上），
     * 而不是变成一行钉死的陈旧默认。
     *
     * @return 实际写入的键数
     */
    public int saveCopy(User actor, Map<String, String> entries) {
        requireSuper(actor, "修改抽屉文案");
        if (entries == null || entries.isEmpty()) {
            throw new IllegalArgumentException("没有要保存的文案");
        }
        Map<String, String> defaults = AiDrawerCopySeed.defaultCopies();
        // 先整批校验：有越界键就一个都不写
        for (String key : entries.keySet()) {
            if (key == null || !defaults.containsKey(key)) {
                throw new IllegalArgumentException("文案键不在允许范围内：" + key);
            }
        }
        Map<String, String> before = copyStore.readValues(AiDrawerCopySeed.MODULE);
        int n = 0;
        // **只写请求里明确给出的键**（不变量，勿改）：遍历的是 entries，没给出的键一律不碰。
        // 整份保存的客户端可能拿不到全部键；若按「没给=空」覆盖，会把库里的值静默清掉（同能力清单的保留口径）。
        for (Map.Entry<String, String> e : entries.entrySet()) {
            String key = e.getKey();
            String raw = e.getValue();
            String newValue = (raw == null || raw.isBlank()) ? null : raw;
            copyStore.upsertValue(AiDrawerCopySeed.MODULE, key, newValue);
            writeStore.insertAudit(AiDrawerCopySeed.MODULE, key, before.get(key), newValue, actor.getId());
            n++;
        }
        return n;
    }

    // ── ② 保存能力清单（整份提交：新增 / 修改 / 删除 / 排序一次提交）──

    /**
     * 整份保存能力清单。
     *
     * <p><b>为什么整份保存是安全的、也是拖拽排序唯一可行的做法</b>：这张表**只有本功能一个写手**
     * （播种器 {@code AiCapabilityPromptSeed} 只在首次播种时插、之后一个字段都不动），
     * 所以「提交里没有的 id 即删」不会误删别人的行；而拖拽排序本来就需要一次提交整份的新顺序，
     * 逐条接口要附带一堆排序补丁，反而更容易排乱。
     *
     * <p>口径：
     * <ul>
     *   <li>{@code id == null} → 新增；{@code id} 非空 → 改这一条；库里在、提交里没有的 id → 删。</li>
     *   <li>标题与提示词**必须非空**；超列宽（title 256 / prompt_text 512 / group_name 64）直接拒。</li>
     *   <li>排序号允许并列 —— 读取按 {@code sort_order, id} 升序，同号由 id 兜底，结果稳定。</li>
     *   <li>先整份校验再落库：中途任一条不合法，一条都不写（不做半写）。</li>
     * </ul>
     *
     * @return 落库后的完整清单（含新生成的 id，按 sort_order, id 升序）
     */
    public List<CapabilityItem> saveCapabilities(User actor, List<CapabilityItem> items) {
        requireSuper(actor, "修改能力清单");
        if (items == null) {
            throw new IllegalArgumentException("没有要保存的能力清单");
        }
        List<CapabilityItem> current = writeStore.selectAllOrdered();
        Map<Long, CapabilityItem> existing = new LinkedHashMap<>();
        for (CapabilityItem c : current) {
            if (c.id() != null) {
                existing.put(c.id(), c);
            }
        }

        Set<Long> seenIds = new LinkedHashSet<>();
        List<CapabilityItem> normalized = new ArrayList<>();
        for (CapabilityItem it : items) {
            String title = strip(it.title());
            if (title.isEmpty()) {
                throw new IllegalArgumentException("能力标题不能为空");
            }
            String prompt = strip(it.promptText());
            if (prompt.isEmpty()) {
                throw new IllegalArgumentException("能力提示词不能为空");
            }
            if (title.length() > 256) {
                throw new IllegalArgumentException("能力标题太长（上限 256）：" + title);
            }
            if (prompt.length() > 512) {
                throw new IllegalArgumentException("能力提示词太长（上限 512）：" + title);
            }
            String group = strip(it.groupName());
            if (group.length() > 64) {
                throw new IllegalArgumentException("分组名太长（上限 64）：" + group);
            }
            Long id = it.id();
            if (id != null && !existing.containsKey(id)) {
                throw new IllegalArgumentException("这条能力已经不在了（可能别人删过）：id=" + id);
            }
            if (id != null && !seenIds.add(id)) {
                throw new IllegalArgumentException("同一条能力在提交里出现了两次：id=" + id);
            }
            /*
             * **已有行（带 id）：请求里没给的列保留库里的原值；新建行（无 id）才用默认值。**
             *
             * 为什么必须保留：这是「整份保存」，客户端拿到的整份未必包含全部列 —— 例如只读面发的清单
             * 就不带 enabled / audience。若把「请求里没有」一律当成默认（enabled=true、audience=全员）覆盖，
             * 一次看似无害的保存就会**静默**把「谁看得见」重置成全员、把停用项重新启用 —— 用户看不到任何报错，
             * 只会发现「改了别的东西，怎么谁都能看见了」。所以这里的缺省只在**新建行**才生效。
             */
            Boolean enabled;
            String audience;
            String note;
            if (id != null) {
                CapabilityItem prev = existing.get(id);
                enabled = it.enabled() != null ? it.enabled() : prev.enabled();
                audience = it.audience() != null ? it.audience().strip() : prev.audience();
                note = it.note() != null ? it.note().strip() : prev.note();
            } else {
                enabled = it.enabled() != null ? it.enabled() : Boolean.TRUE;
                audience = it.audience() != null ? it.audience().strip() : "";
                note = it.note() != null ? it.note().strip() : "";
            }
            normalized.add(new CapabilityItem(id, group, title, prompt, note,
                    it.sortOrder() == null ? 0 : it.sortOrder(),
                    enabled, audience));
        }

        Set<Long> presentIds = new LinkedHashSet<>();
        for (CapabilityItem it : normalized) {
            if (it.id() == null) {
                presentIds.add(writeStore.insert(it));
            } else {
                writeStore.update(it);
                presentIds.add(it.id());
            }
        }
        List<Long> toDelete = new ArrayList<>();
        for (Long id : existing.keySet()) {
            if (!presentIds.contains(id)) {
                toDelete.add(id);
            }
        }
        if (!toDelete.isEmpty()) {
            writeStore.deleteByIds(toDelete);
        }
        return writeStore.selectAllOrdered();
    }

    private static String strip(String s) {
        return s == null ? "" : s.strip();
    }
}
