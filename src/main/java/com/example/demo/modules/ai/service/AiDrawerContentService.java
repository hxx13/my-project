package com.example.demo.modules.ai.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.bootstrap.AiCopyConfigStore;
import com.example.demo.modules.ai.bootstrap.AiDrawerCopySeed;
import com.example.demo.modules.ai.mapper.AiCapabilityPromptMapper;
import com.example.demo.modules.ai.timer.service.AiTimerService;
import com.example.demo.modules.ai.tool.AiView;
import com.example.demo.modules.auth.entity.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * AI 对话抽屉的两份内容：界面固定文案 + 能力提示词清单。
 *
 * <p>载体无关（小程序抽屉与 web 球球面板取同一份）。两件事的「真相源」不同：
 * <ul>
 *   <li><b>文案</b>：键集合恒等于 {@link AiDrawerCopySeed} 的清单（按清单发键，库里多出的
 *       别的键 —— 例如 {@code ai.prompt.global} —— 一律不发）。每个键库里有非空值就用库里的，
 *       否则回落代码内置默认；**任何键都不为空、不缺键**。</li>
 *   <li><b>能力清单</b>：全部来自库，只取启用行、**再按调用者视角过滤**（{@code audience} 列，
 *       见 {@link #visibleTo}）、按排序号升序，同组相邻聚合成「分组 + 条目」。</li>
 * </ul>
 */
@Service
public class AiDrawerContentService {

    private static final Logger log = LoggerFactory.getLogger(AiDrawerContentService.class);

    private final AiCopyConfigStore copyStore;
    private final AiCapabilityPromptMapper capabilityMapper;

    public AiDrawerContentService(AiCopyConfigStore copyStore,
                                  AiCapabilityPromptMapper capabilityMapper) {
        this.copyStore = copyStore;
        this.capabilityMapper = capabilityMapper;
    }

    /**
     * 抽屉内容：{@code copy} 与 {@code capabilities} 两份。
     *
     * @param view 调用者视角（由登录人经 {@code CageModeVisibilityService#isStudent} 判定后传入）；
     *             能力清单按它过滤 —— 只看该视角看得见的条目。
     */
    public Map<String, Object> content(AiView view) {
        return content(view, RoleEnum.STAFF.getLevel());
    }

    /**
     * 同上，另带调用者的角色档 —— {@code audience} 写「管理员档」的条目只有够级别的才看得见。
     * 不给角色档的那个重载只是「只关心视角过滤」的调用方（单测）用，真实调用方一律走这一个。
     *
     * @param roleLevel 调用者角色等级（{@link RoleEnum#getLevel()}）；传不到时按普通教职工处理，
     *                  宁可少给管理员条目，也不要把够不到的能力铺给所有人。
     */
    public Map<String, Object> content(AiView view, int roleLevel) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("copy", buildCopy());
        out.put("capabilities", buildCapabilities(view, roleLevel));
        return out;
    }

    /**
     * **管理端**整份内容（仅 ≥SUPER_ADMIN，判据复用 {@link AiTimerService#isSuper}，不另写一套）。
     *
     * <p>与只读面 {@link #content} 的差别有三，缺一不可：
     * <ul>
     *   <li><b>不按视角过滤</b> —— 编辑态要看全量，包括别人视角才看得见的条目；</li>
     *   <li><b>含停用行</b> —— 超管要能把停用项改回来；</li>
     *   <li><b>每条带 {@code enabled / audience} 与中文名</b> —— 这是编辑「读整份 → 改 → 存整份」的闭环所需。</li>
     * </ul>
     *
     * <p><b>为什么必须另开一面</b>：若照只读面发，{@code enabled / audience} 两列与停用行都会缺席；
     * 客户端存整份时按缺省覆盖，会把「谁看得见」重置成全员、把启用位重置 —— <b>静默丢数据</b>。
     * 越权（非超管）**明确拒**，抛异常由控制器转成错误，不静默返回。
     */
    public Map<String, Object> adminContent(User actor) {
        if (!AiTimerService.isSuper(actor)) {
            throw new IllegalStateException("只有超级管理员及以上能查看完整抽屉内容");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("copy", buildCopyWithLabels());
        out.put("capabilities", buildAllCapabilities());
        return out;
    }

    /** 每键：{@code key / label（中文名）/ value}，取值口径与只读面一致（库里有非空值用库里的，否则回落代码默认）。 */
    private List<Map<String, Object>> buildCopyWithLabels() {
        Map<String, String> db = copyStore.readValues(AiDrawerCopySeed.MODULE);
        Map<String, String> labels = AiDrawerCopySeed.defaultLabels();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map.Entry<String, String> e : AiDrawerCopySeed.defaultCopies().entrySet()) {
            String key = e.getKey();
            String stored = db.get(key);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("key", key);
            m.put("label", labels.get(key));
            m.put("value", StringUtils.hasText(stored) ? stored : e.getValue());
            out.add(m);
        }
        return out;
    }

    /**
     * 全部条目（含停用、不过滤视角），每条带
     * {@code id / groupName / title / promptText / sortOrder / enabled / audience}，按 {@code sort_order, id} 升序。
     * {@code enabled} 归一成布尔、{@code audience} 空值归一成空串，好让编辑器原样回存。
     */
    private List<Map<String, Object>> buildAllCapabilities() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : capabilityMapper.selectAllOrdered()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", row.get("id"));
            m.put("groupName", row.get("groupName"));
            m.put("title", row.get("title"));
            m.put("promptText", row.get("promptText"));
            m.put("note", row.get("note") == null ? "" : String.valueOf(row.get("note")));
            m.put("sortOrder", row.get("sortOrder"));
            m.put("enabled", isEnabled(row.get("enabled")));
            m.put("audience", row.get("audience") == null ? "" : String.valueOf(row.get("audience")));
            out.add(m);
        }
        return out;
    }

    /**
     * 键 → 文案。**按代码清单发键**，库里有非空值就覆盖默认。
     * 这样界面永远拿得到全套键，管理员没配的退回原文，配错的空串也退回原文。
     */
    private Map<String, String> buildCopy() {
        Map<String, String> db = copyStore.readValues(AiDrawerCopySeed.MODULE);
        Map<String, String> out = new LinkedHashMap<>();
        for (Map.Entry<String, String> e : AiDrawerCopySeed.defaultCopies().entrySet()) {
            String stored = db.get(e.getKey());
            out.put(e.getKey(), StringUtils.hasText(stored) ? stored : e.getValue());
        }
        return out;
    }

    /**
     * 能力清单：先按调用者视角滤掉看不见的条目，再取启用项按 sort_order 升序，
     * **同分组相邻聚成一组**（组名只做就近归类，不单独排序 —— 排序始终看 sort_order）。空表返回空列表。
     *
     * <p>过滤与排序在 Java 里再做一遍：SQL 已过滤/排序（拿到的是收紧后的行），但单测替身不走 SQL，
     * 「启用判定」「视角判定」与「排序输出」这几条契约得在服务端自成立才算被测到。Java 的 List.sort 稳定，
     * 同号保持 mapper 的 id 序。
     */
    private List<Map<String, Object>> buildCapabilities(AiView view, int roleLevel) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Map<String, Object> row : capabilityMapper.selectEnabledOrdered()) {
            if (!isEnabled(row.get("enabled"))) {
                continue;
            }
            if (!visibleTo(row.get("audience"), view, roleLevel)) {
                continue;
            }
            rows.add(row);
        }
        rows.sort(Comparator.comparingInt(r -> intOf(r.get("sortOrder"))));

        List<Map<String, Object>> groups = new ArrayList<>();
        String currentGroup = null;
        List<Map<String, Object>> currentItems = null;
        for (Map<String, Object> row : rows) {
            String group = row.get("groupName") == null ? "" : String.valueOf(row.get("groupName"));
            if (currentItems == null || !group.equals(currentGroup)) {
                currentItems = new ArrayList<>();
                Map<String, Object> g = new LinkedHashMap<>();
                g.put("groupName", group);
                g.put("items", currentItems);
                groups.add(g);
                currentGroup = group;
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", row.get("id"));
            item.put("title", row.get("title"));
            item.put("promptText", row.get("promptText"));
            item.put("note", row.get("note") == null ? "" : String.valueOf(row.get("note")));
            item.put("sortOrder", row.get("sortOrder"));
            currentItems.add(item);
        }
        return groups;
    }

    /**
     * 这一条对当前调用者可不可见。{@code audience} 取值：
     * <ul>
     *   <li>空白（null / 空串）→ <b>全员可见</b>（老数据与不标注的都是全员，也是列的默认值）；</li>
     *   <li>{@code STAFF} / {@code STUDENT}（大小写不敏感）→ 只对该**视角**可见；</li>
     *   <li>{@code ADMIN} / {@code SUPER_ADMIN} → 该**角色档及以上**可见（视角仍须是教职工）。</li>
     * </ul>
     * 角色档是后补的：工具包里按 {@link RoleEnum} 分档的能力（门禁明细 / 长期归档 / 申领审计 /
     * 物品管理 / 门户内容 / 免冻要 ADMIN，门禁控制 / 人员档案要 SUPER_ADMIN）原先只能靠
     * {@code STAFF} 标成「教职工都看得见」，普通教职工点了却办不了 —— 标注得跟闸门对齐才算数。
     *
     * <p>其余未知取值 → 按「全员」放行，并记一条 WARN：这种值只可能是管理员写错了标注，此时
     * 静默隐藏会让管理员改了却没反应、且查不出原因（正是「声明了配置项却不生效」那类坑）；
     * 放行与列默认的「不标注=全员」语义一致，而 WARN 让这条错标注在日志里可见、可追。**不是静默丢弃**。
     */
    static boolean visibleTo(Object audience, AiView view, int roleLevel) {
        String s = audience == null ? "" : String.valueOf(audience).trim();
        if (s.isEmpty()) {
            return true; // 全员
        }
        if (AiView.STAFF.name().equalsIgnoreCase(s)) {
            return view == AiView.STAFF;
        }
        if (AiView.STUDENT.name().equalsIgnoreCase(s)) {
            return view == AiView.STUDENT;
        }
        // 角色档：ADMIN / SUPER_ADMIN —— 够级别才看得见（视角仍须是教职工）。
        // 能力清单原来只看「视角」，而工具能不能真的注入由各工具包的 capabilities() 按 RoleEnum 分档；
        // 清单里写 STAFF 的管理员条目，普通教职工点了会被回一句「不在我这轮范围」。
        for (RoleEnum tier : List.of(RoleEnum.ADMIN, RoleEnum.SUPER_ADMIN)) {
            if (tier.name().equalsIgnoreCase(s)) {
                return view == AiView.STAFF && roleLevel >= tier.getLevel();
            }
        }
        log.warn("[ai-drawer] 能力条目 audience 取值未知，按全员放行: audience={}", audience);
        return true;
    }

    /**
     * 启用判定。MySQL/MariaDB 的 TINYINT(1) 可能映射成 Boolean，也可能是 Number；
     * 列没取到时（null）不误杀，按启用处理。
     */
    private static boolean isEnabled(Object v) {
        if (v == null) {
            return true;
        }
        if (v instanceof Boolean b) {
            return b;
        }
        if (v instanceof Number n) {
            return n.intValue() != 0;
        }
        String s = String.valueOf(v);
        return "1".equals(s) || "true".equalsIgnoreCase(s);
    }

    private static int intOf(Object v) {
        if (v instanceof Number n) {
            return n.intValue();
        }
        if (v == null) {
            return 0;
        }
        try {
            return Integer.parseInt(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    // ── 推荐指令条（输入框上方那条） ──

    /** 推荐指令条默认最多发几条。界面自己还会按宽度再截，这里只是个上限。 */
    private static final int DEFAULT_RECOMMENDED_LIMIT = 12;

    /**
     * 输入框上方的**推荐指令条**：**个人热度为主、全站热度为辅、卡片原排序兜底**。
     *
     * <p>排序在服务端**一处算完**，两端只负责渲染 —— 否则会出现「web 排一个样、小程序排一个样」。
     *
     * <p><b>不新建表、不新增采集</b>：原料是「这个人发过、且**逐字等于**某张卡片正文」的消息条数
     * （方案 A，见设计文档 §7）。点卡片会原样回填并发送，手打同款句子也算；他改了几个字再发就不算，
     * 是已知并接受的损失。
     *
     * <p>可见性沿用能力清单那一套判定（{@link #visibleTo}），不另写一套 —— 判据只有一处实现，
     * 否则「推荐条里点得到、清单里看不见」这类不一致迟早出现。
     */
    public List<Map<String, Object>> recommended(AiView view, int roleLevel, String userId, int limit) {
        int cap = limit <= 0 ? DEFAULT_RECOMMENDED_LIMIT : Math.min(limit, DEFAULT_RECOMMENDED_LIMIT);

        List<Map<String, Object>> visible = new ArrayList<>();
        for (Map<String, Object> row : capabilityMapper.selectEnabledOrdered()) {
            if (!isEnabled(row.get("enabled")) || !visibleTo(row.get("audience"), view, roleLevel)) {
                continue;
            }
            visible.add(row);
        }
        if (visible.isEmpty()) {
            return List.of();
        }

        Map<Long, Long> userHits = hitsById(capabilityMapper.countHitsByUser(userId));
        Map<Long, Long> globalHits = hitsById(capabilityMapper.countHitsGlobal());

        visible.sort(Comparator
                .comparingLong((Map<String, Object> r) -> userHits.getOrDefault(longOf(r.get("id")), 0L)).reversed()
                .thenComparing(Comparator.comparingLong(
                        (Map<String, Object> r) -> globalHits.getOrDefault(longOf(r.get("id")), 0L)).reversed())
                .thenComparingInt(r -> intOf(r.get("sortOrder")))
                .thenComparingLong(r -> longOf(r.get("id"))));

        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : visible.subList(0, Math.min(cap, visible.size()))) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", row.get("id"));
            m.put("title", row.get("title"));
            m.put("promptText", row.get("promptText"));
            m.put("note", row.get("note") == null ? "" : String.valueOf(row.get("note")));
            out.add(m);
        }
        return out;
    }

    /** 把 mapper 的 {@code [{cardId, hits}]} 摊成 id → 次数。空表 / 缺列一律当 0，不误杀。 */
    private static Map<Long, Long> hitsById(List<Map<String, Object>> rows) {
        Map<Long, Long> m = new HashMap<>();
        if (rows == null) {
            return m;
        }
        for (Map<String, Object> r : rows) {
            Object id = r.get("cardId");
            if (id == null) {
                continue;
            }
            m.put(longOf(id), longOf(r.get("hits")));
        }
        return m;
    }

    private static long longOf(Object v) {
        if (v instanceof Number n) {
            return n.longValue();
        }
        if (v == null) {
            return 0L;
        }
        try {
            return Long.parseLong(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return 0L;
        }
    }
}
