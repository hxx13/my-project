package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.tool.AiChoices;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolContext;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.AiView;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.facilitymaintenance.service.FacilityMaintenanceService;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

/**
 * 「检查维护」（{@code /#/console/admin/facility-maintenance}）的**耗材 / 更换**两个页签 ——
 * 小程序同一页在 {@code package-ops/pages/facilityMaintenance}。
 *
 * <h2>管什么</h2>
 * <ul>
 *   <li><b>耗材登记</b>（{@code fm_consumable_line}）：某机房消耗了某个耗材多少、什么时候。</li>
 *   <li><b>更换记录</b>（{@code fm_replacement_record}）：某机房换了哪个级别的过滤器（初效/中效/高效）。</li>
 * </ul>
 * 两者都是**台账行**：记一条、改一条、删一条。口径与页面表单一一对应，页面做不出的这里也不做。
 *
 * <h2>不管什么（别拿这个包去糊）</h2>
 * <ul>
 *   <li><b>巡查</b>（巡查记录 / 当日巡查表 / 模板 / 选项集）：那是另一套录入（逐项填格、按日协作），
 *       页面上有专门的表格交互，对话里复刻不了。用户问巡查就说这轮没接，别拿耗材糊过去。</li>
 *   <li><b>机房主数据</b>、<b>耗材名目</b>、<b>更换类型预设</b>的增删改：这些是配置，
 *       改错会影响所有人的下拉框。要改到设置页做。</li>
 * </ul>
 *
 * <h2>和页面一致的三条硬口径</h2>
 * <ol>
 *   <li><b>机房（地点）必填</b>，而且是**机房的 id**，不是名字。用户只说「阻垢剂用了半桶」时，
 *       先把机房做成可点选项问一句 —— 这正是一次只问一件里最该问的那一件。</li>
 *   <li><b>更换类型只能取预设</b>（初效 / 中效 / 高效）。用户说「换了过滤网」没说级别时，
 *       把预设做成选项问一句，**不要**自己编一个「过滤网」当类型。</li>
 *   <li><b>登记人由登录态决定</b>，工具里没有也不该有这个字段 —— 对话里说的话不能左右
 *       「这条是谁记的」。</li>
 * </ol>
 *
 * <h2>视角与能力</h2>
 * 与页面同门槛：页面在页面权限表里要求 STAFF，控制器每个口子都 {@code requireStaff}。
 * 所以能力码 = STAFF，且 {@link #views()} 显式声明 {@link AiView#STAFF}（学生视角拿不到 ——
 * 判据同前端 {@code isStudentAccount()}，不按角色等级）。
 */
@Component
public class FacilityMaintenanceToolPack implements AiToolPack {

    public static final String CAP_FACILITY_MAINTENANCE = "ai.facility.maintenance";

    /** 列表最多回多少行。台账行多，回太多既贵又没用；要更早的自己加时间段。 */
    private static final int MAX_ROWS = 40;

    /** 候选做成可点芯片的上限。机房是**受控的短名单**（本机 9 个），比一般候选多留几个位。 */
    private static final int CHIP_MAX = 12;

    /** 汇总时最多翻多少条。台账总条数会涨，到了就停 —— 别为了一次统计把整表拉爆。 */
    private static final int SUM_CEILING = 4000;

    private final FacilityMaintenanceService service;

    public FacilityMaintenanceToolPack(FacilityMaintenanceService service) {
        this.service = service;
    }

    @Override
    public String packKey() {
        return "facilityMaintenance";
    }

    @Override
    public String displayName() {
        return "检查维护";
    }

    @Override
    public Set<AiView> views() {
        // 显式写出来是为了可审计：本包是教职工侧后台页的能力，学生视角永远拿不到
        return Set.of(AiView.STAFF);
    }

    @Override
    public Set<String> routeHints() {
        return Set.of("检查维护", "维保", "耗材", "更换记录", "过滤网", "初效", "中效", "高效", "阻垢剂");
    }

    @Override
    public Map<String, Predicate<User>> capabilities() {
        // 与页面权限表里的 minRole 同源：检查维护页对 STAFF 开放
        return Map.of(CAP_FACILITY_MAINTENANCE, user -> user.getRole() != null
                && user.getRole().getLevel() >= RoleEnum.STAFF.getLevel());
    }

    @Override
    public List<AiTool> tools() {
        return List.of(listOptions(), listConsumableLines(), summarizeConsumableUsage(),
                createConsumableLine(), updateConsumableLine(), deleteConsumableLine(),
                listReplacementRecords(), createReplacementRecords(),
                updateReplacementRecord(), deleteReplacementRecord());
    }

    @Override
    public String defaultPrompt() {
        return """
                检查维护（#/console/admin/facility-maintenance，小程序「检查维护」页同源）里
                **耗材登记** 与 **更换记录** 两个页签的口径：
                - 本包管这两本**台账**：记一条、改一条、删一条。**巡查不在本包**
                  （巡查记录 / 当日巡查表 / 模板 / 选项集都没接）。用户问巡查就直说没接，
                  别拿耗材或更换的记录糊过去 —— 两边不是一套东西。
                - **机房的主数据、耗材名目、更换类型预设都不是本包**（那是设置页的事）。
                  用户要给某个机房改名、加减一个「耗材名目」，说清到页面上做。
                - **登记人由登录态决定**：工具里没有这个字段，也**不要**在正文里替用户认领
                  「以谁的名义记的」。
                - **缺参数先问，一次只问一件；能做成芯片的一律做成可点芯片**，别在正文里列候选。
                  两条最容易漏：
                  ① **机房必填**。用户只说「记录今天消耗半桶阻垢剂」时，调
                     listFmOptions(kind=sites) 把机房做成选项，问一句「是哪个机房」；
                  ② **更换类型只能取预设**（初效 / 中效 / 高效）。用户说「换了过滤网」而没提级别时，
                     调 listFmOptions(kind=replacementTypes) 让他在预设里挑，**不要**自己编一个
                     「过滤网」写进类型 —— 那不是页面能选出来的值。
                - **用户给了口语化的量就换算成数字加单位**：半桶 = qty 0.5 + unit 桶；一桶半 = 1.5 桶；
                  两包 = 2 包。换算不出来（「用了一些」）就问清数量和单位，别猜一个数填进去。
                - **时间**：用户说「今天 / 刚才 / 今日」→ **不要传时间**，服务端会按当下时刻记，
                  比你自己算准。说了具体日期才传（2026-10-09 或 2026-10-09T14:30:00）。
                - **记一条是一次写**，会让用户在界面上点确认。正文里**不要**说「已经记好了」，
                  等确认之后再据回读的结果说。
                - **改 / 删之前先把那条找出来**：调 listFmConsumableLines 或 listFmReplacementRecords
                  拿 id（带机房、名称、时间、登记人）。命中多条时把候选做成可点选项让用户挑，
                  **别自己挑一条改掉**。用户说「删掉昨天那条」而你拿不准是哪条时，宁可再问一句。
                - **问「最多 / 排行 / 趋势 / 规律 / 多久用一次」一律用 summarizeFmConsumableUsage**，
                  别用 listFmConsumableLines 的行去数 —— 那个是分页的、还会截断，
                  拿它数会得出「其余机房只有零星几条」这种错结论（真机 2026-10-09 就是这么错的）。
                  汇总工具报的 `rows` 是**筛选内全部记录**的条数；报排行把前几名照实说，
                  没进前几名的不等于「几乎没有」。**别把不同单位的数量加起来当总量说**。
                - **一次只说一件事**：用户一次报了多条（「甲机房换了初效，乙机房换了高效」）时，
                  逐条调工具写，**不要**把两个机房的记录合成一条。
                - 写坏了没有撤销。删除是真的删行（页面上也有同样的确认框）。
                """;
    }

    // ── 读：选项（机房 / 名目 / 更换类型） ──

    private AiTool listOptions() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "kind": {
                      "type": "string",
                      "enum": ["sites", "consumableCatalog", "replacementTypes"],
                      "description": "sites=机房（记耗材或更换前要选的那个，必填项）；consumableCatalog=耗材名目（带默认单位，用来对齐用户口语里的名字）；replacementTypes=更换类型预设（初效/中效/高效）"
                    },
                    "keyword": { "type": "string", "description": "只看名字里含这个片段的（可选）" }
                  },
                  "required": ["kind"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listFmOptions",
                "查检查维护里的**下拉候选**：机房（地点）、耗材名目、更换类型预设。"
                        + "**记耗材/更换前不知道机房时用它**（机房必填）；用户说了「过滤网」但没提级别时，"
                        + "用 replacementTypes 让他在预设里挑。候选会做成可点选项。"
                        + "耗材名目用它对齐用户口语里的叫法与默认单位。",
                schema, CAP_FACILITY_MAINTENANCE, SideEffect.READ,
                (ctx, args) -> doListOptions(args));
    }

    private Map<String, Object> doListOptions(JsonNode args) {
        String kind = text(args, "kind").toLowerCase(Locale.ROOT);
        String kw = text(args, "keyword");
        Map<String, Object> out = new LinkedHashMap<>();
        switch (kind) {
            case "sites" -> {
                List<Map<String, Object>> sites = orEmpty(service.listSites(false));
                List<Map<String, Object>> chips = new ArrayList<>();
                List<Map<String, Object>> rows = new ArrayList<>();
                for (Map<String, Object> s : sites) {
                    String name = firstStr(s, "name");
                    if (!matches(name, kw)) continue;
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("siteId", str(s.get("id")));
                    row.put("name", name);
                    rows.add(row);
                    chips.add(AiChoices.option(name, str(s.get("id"))));
                }
                out.put("ok", true);
                out.put("kind", "sites");
                out.put("sites", rows);
                if (chips.isEmpty()) {
                    out.put("note", "没有匹配的机房。别硬编一个，问清用户指的是哪个机房。");
                } else if (chips.size() <= CHIP_MAX) {
                    // 机房是必填的单选题 —— 做成可点选项，用户点一下比打字准
                    out.putAll(AiChoices.single("是哪个机房（地点）？", chips));
                    out.put("note", "把上面这枚问题**交给用户点**（界面会渲染成可点选项），"
                            + "他点完你再拿 siteId 去记。**不要在正文里把候选再列一遍**。");
                } else {
                    out.put("note", "机房太多，挑相关的几个问用户，别全列出来。");
                }
            }
            case "consumablecatalog" -> {
                List<Map<String, Object>> cats = orEmpty(service.listConsumableCatalog(false));
                List<Map<String, Object>> rows = new ArrayList<>();
                for (Map<String, Object> c : cats) {
                    String name = firstStr(c, "name");
                    if (!matches(name, kw)) continue;
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("name", name);
                    row.put("unit", firstStr(c, "unit"));
                    rows.add(row);
                }
                out.put("ok", true);
                out.put("kind", "consumableCatalog");
                out.put("catalog", rows);
                // 名目是**填空助手**不是必选项：用户完全可以说名目里没有的东西，所以不做成单选题
                out.put("note", "这些是页面上的快捷名目（带默认单位）。用户说的名字能对上就用它的写法与单位；"
                        + "对不上就照用户自己说的写，**不要**为了凑名目改掉他的说法。");
            }
            case "replacementtypes" -> {
                List<Map<String, Object>> presets = orEmpty(service.listReplacementFilterPresets(false));
                List<Map<String, Object>> chips = new ArrayList<>();
                List<String> labels = new ArrayList<>();
                for (Map<String, Object> p : presets) {
                    String label = firstStr(p, "label");
                    if (!matches(label, kw)) continue;
                    labels.add(label);
                    chips.add(AiChoices.option(label, label));
                }
                out.put("ok", true);
                out.put("kind", "replacementTypes");
                out.put("types", labels);
                if (!chips.isEmpty() && chips.size() <= CHIP_MAX) {
                    // 一个机房一次可能换好几级 → 多选题
                    out.putAll(AiChoices.multi("换了哪些级别（可多选，勾完点确认）", chips));
                    out.put("note", "把上面这枚问题**交给用户勾**。他勾完你按这些级别逐条记；"
                            + "**别自己替他挑一个**，也别把「过滤网」这类用户口语当成级别写进去。");
                } else {
                    out.put("note", "让用户从上面这些预设里挑，**不要**自己编一个类型。");
                }
            }
            default -> {
                out.put("ok", false);
                out.put("reason", "kind 只能是 sites / consumableCatalog / replacementTypes");
            }
        }
        return out;
    }

    // ── 耗材登记 ──

    private AiTool listConsumableLines() {
        return new AiTool(
                "listFmConsumableLines",
                "查**耗材登记**台账（检查维护页「耗材」页签那张表）。"
                        + "回答「某机房用了哪些耗材 / 上次阻垢剂什么时候用的」、以及**改删之前先把那条找出来拿 id**，都用它。"
                        + "关键词与时间段由服务端筛；回给你的行数是截断的，`matchedTotal` 才是命中总数。",
                listSchema(), CAP_FACILITY_MAINTENANCE, SideEffect.READ,
                (ctx, args) -> listLedger(args, (siteId, kw, from, to, page, size) ->
                        service.listConsumableLines(siteId, kw, from, to, page, size)));
    }

    private AiTool summarizeConsumableUsage() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "groupBy": {
                      "type": "string",
                      "enum": ["site", "consumable", "month"],
                      "description": "按什么汇总：site=按机房（哪个机房用得多）；consumable=按耗材（哪种耗材用得多）；month=按月份（逐月趋势）"
                    },
                    "siteId": { "type": "string", "description": "只看某个机房（可选）" },
                    "keyword": { "type": "string", "description": "只看名称含这个片段的耗材（可选）" },
                    "from": { "type": "string", "description": "只看这个日期之后（含当天），2026-01-01" },
                    "to": { "type": "string", "description": "只看这个日期之前（含当天）" }
                  },
                  "required": ["groupBy"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "summarizeFmConsumableUsage",
                "**耗材登记台账的汇总/排行/趋势**：哪个机房用得最多、哪种耗材用得最多、逐月用量、"
                        + "以及某种耗材「多久用一次」（看 avgIntervalDays）。"
                        + "**问「最多 / 排行 / 趋势 / 规律 / 多久一次」一律用它** —— "
                        + "它是对**筛选内的全部记录**算的；"
                        + "listFmConsumableLines 是分页返回的（还会截断），"
                        + "**拿它的行去数会得出错的结论**（真机 2026-10-09 踩过：只看到最近 40 条就下了「其余都是零星几条」）。",
                schema, CAP_FACILITY_MAINTENANCE, SideEffect.READ,
                (ctx, args) -> doSummarizeConsumable(args));
    }

    private Map<String, Object> doSummarizeConsumable(JsonNode args) {
        String groupBy = text(args, "groupBy").toLowerCase(Locale.ROOT);
        if (!List.of("site", "consumable", "month").contains(groupBy)) {
            return Map.of("ok", false, "reason", "groupBy 只能是 site / consumable / month");
        }
        String siteId = text(args, "siteId");
        String kw = text(args, "keyword");
        LocalDate from = parseDate(text(args, "from"));
        LocalDate to = parseDate(text(args, "to"));

        // 筛选交给 SQL（机房/关键词/时间段），这里只做汇总 —— 别自己拉全表回来筛
        List<Map<String, Object>> all = allConsumableRows(siteId.isEmpty() ? null : siteId,
                kw.isEmpty() ? null : kw, from, to);
        Map<String, long[]> rowsByGroup = new LinkedHashMap<>();      // 组 → [条数]
        Map<String, BigDecimal> qtyByGroup = new LinkedHashMap<>();
        Map<String, String> firstByGroup = new LinkedHashMap<>();
        Map<String, String> lastByGroup = new LinkedHashMap<>();
        int matched = 0;
        BigDecimal totalQty = BigDecimal.ZERO;
        String overallFirst = null;
        String overallLast = null;
        for (Map<String, Object> r : all) {
            String name = firstStr(r, "consumableName");
            String at = firstStr(r, "occurredAt", "occurred_at");
            matched++;
            String key = switch (groupBy) {
                case "site" -> firstStr(r, "siteName");
                case "month" -> at.length() >= 7 ? at.substring(0, 7) : "";
                default -> name;
            };
            if (key.isEmpty()) key = "（未填）";
            rowsByGroup.computeIfAbsent(key, k -> new long[1])[0]++;
            BigDecimal q = decimalOrZero(r.get("qty"));
            qtyByGroup.merge(key, q, BigDecimal::add);
            totalQty = totalQty.add(q);
            if (at.length() >= 10) {
                String d = at.substring(0, 10);
                if (firstByGroup.get(key) == null || d.compareTo(firstByGroup.get(key)) < 0) firstByGroup.put(key, d);
                if (lastByGroup.get(key) == null || d.compareTo(lastByGroup.get(key)) > 0) lastByGroup.put(key, d);
                if (overallFirst == null || d.compareTo(overallFirst) < 0) overallFirst = d;
                if (overallLast == null || d.compareTo(overallLast) > 0) overallLast = d;
            }
        }

        List<Map<String, Object>> groups = new ArrayList<>();
        for (Map.Entry<String, long[]> e : rowsByGroup.entrySet()) {
            long n = e.getValue()[0];
            Map<String, Object> g = new LinkedHashMap<>();
            g.put("key", e.getKey());
            g.put("rows", n);
            g.put("qty", plain(qtyByGroup.get(e.getKey())));
            g.put("firstAt", firstByGroup.get(e.getKey()));
            g.put("lastAt", lastByGroup.get(e.getKey()));
            // 「多久用一次」：首末之间的天数 ÷ 间隔数。只出现一次时没有间隔可言。
            String f = firstByGroup.get(e.getKey());
            String l = lastByGroup.get(e.getKey());
            if (n >= 2 && f != null && l != null) {
                // 必须用 ChronoUnit.DAYS —— Period.getDays() 只取「天」那一位，
                // 跨年的部分会被丢掉（2 年 6 天会算成 6 天，均值直接差两个数量级；真机 2026-10-09 撞到）
                long days = ChronoUnit.DAYS.between(LocalDate.parse(f), LocalDate.parse(l));
                g.put("avgIntervalDays", Math.round(days / (double) (n - 1) * 10) / 10.0);
            }
            groups.add(g);
        }
        groups.sort((a, b) -> Long.compare(((Number) b.get("rows")).longValue(), ((Number) a.get("rows")).longValue()));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("groupBy", groupBy);
        out.put("matchedRows", matched);
        out.put("totalQty", plain(totalQty));
        out.put("firstAt", overallFirst);
        out.put("lastAt", overallLast);
        out.put("scanned", all.size());
        out.put("groups", groups);
        out.put("note", "上面是对**筛选内全部 " + matched + " 条**算出来的（不是抽样）。"
                + "排行照实报前几名即可，别把「不在前几名」说成「只有零星几条」—— 后面那些的条数也在 groups 里。"
                + "数量合计是**把不同单位混在一起加的**，只在同一耗材/同一单位下才说得出意义，别硬报总额。");
        return out;
    }

    /**
     * 把筛选内的**全部**登记读出来（翻页取全）。
     *
     * <p>筛选（机房/关键词/时间段）**由 SQL 做**，这里只负责翻页 —— 汇总一旦只看一页，
     * 就会得出「其余都不多」这种错结论（真机 2026-10-09 就是这么错的）。
     * 上限 {@link #SUM_CEILING} 条，到了就停。
     */
    private List<Map<String, Object>> allConsumableRows(String siteId, String keyword,
                                                        LocalDate from, LocalDate to) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (int page = 1; out.size() < SUM_CEILING; page++) {
            List<Map<String, Object>> rows = orEmpty(rowsOf(
                    service.listConsumableLines(siteId, keyword, from, to, page, 200)));
            if (rows.isEmpty()) break;
            out.addAll(rows);
            if (rows.size() < 200) break;
        }
        return out;
    }

    private static BigDecimal decimalOrZero(Object o) {
        if (o == null) return BigDecimal.ZERO;
        try {
            return new BigDecimal(String.valueOf(o));
        } catch (NumberFormatException e) {
            return BigDecimal.ZERO;
        }
    }

    private static String plain(BigDecimal q) {
        return q == null ? "0" : q.stripTrailingZeros().toPlainString();
    }

    private AiTool createConsumableLine() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "siteId": { "type": "string", "description": "机房 id，**必填**。不知道就先调 listFmOptions(kind=sites) 问用户，别自己挑" },
                    "consumableName": { "type": "string", "description": "耗材名称，必填。照用户说的写（能对上名目就用名目的写法）" },
                    "qty": { "type": "number", "description": "数量，必填且大于 0。「半桶」= 0.5，「一桶半」= 1.5" },
                    "unit": { "type": "string", "description": "单位（桶 / 包 / 瓶 / 件…）。名目里带默认单位就用它" },
                    "occurredAt": { "type": "string", "description": "发生时间。用户说「今天/刚才」就**别传**，服务端按当下时刻记；说了具体日期才传（2026-10-09 或 2026-10-09T14:30:00）" },
                    "note": { "type": "string", "description": "备注（可选）" }
                  },
                  "required": ["siteId", "consumableName", "qty"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "createFmConsumableLine",
                "记一条**耗材消耗**（检查维护「耗材」页签的新增）。"
                        + "用户说「记录今天消耗半桶阻垢剂」「甲机房用了两包手套」时用它。"
                        + "**机房必填**：不知道是哪个机房就先用 listFmOptions(kind=sites) 问一句，"
                        + "别拿名字当 id 传。",
                schema, CAP_FACILITY_MAINTENANCE, SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> doCreateConsumable(ctx, args),
                null, this::consumableCreatedDetail);
    }

    private Map<String, Object> doCreateConsumable(AiToolContext ctx, JsonNode args) {
        String siteId = text(args, "siteId");
        String name = text(args, "consumableName");
        if (siteId.isEmpty()) {
            return Map.of("ok", false, "reason",
                    "还差机房（地点）。先调 listFmOptions(kind=sites) 把机房做成选项问用户，拿到 id 再记。");
        }
        if (name.isEmpty()) {
            return Map.of("ok", false, "reason", "还差耗材名称。先问用户消耗的是什么，问清了再记。");
        }
        if (!args.path("qty").isNumber()) {
            return Map.of("ok", false, "reason", "还差数量，或者数量不是数。换算成数字+单位再记（半桶 = 0.5 桶）。");
        }
        BigDecimal qty = BigDecimal.valueOf(args.path("qty").asDouble());
        if (qty.signum() <= 0) {
            return Map.of("ok", false, "reason", "数量要大于 0。用户说的确实是 0 就说明他不需要记这一条。");
        }
        LocalDateTime at;
        try {
            at = parseAt(text(args, "occurredAt"));
        } catch (IllegalArgumentException e) {
            return Map.of("ok", false, "reason", e.getMessage());
        }
        String unit = text(args, "unit");
        String note = text(args, "note");
        Map<String, Object> created;
        try {
            created = service.createConsumableLine(siteId, name, qty, blank(unit), at, blank(note),
                    ctx.actor().getId());
        } catch (IllegalArgumentException e) {
            return Map.of("ok", false, "reason", "没记成：" + e.getMessage());
        }
        // 回读：把服务端真正落下的值说回去（时间尤其 —— 没传时是服务端的当下时刻）
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("id", created == null ? null : str(created.get("id")));
        out.put("siteName", siteName(siteId));
        out.put("consumableName", name);
        out.put("qty", qty.stripTrailingZeros().toPlainString());
        out.put("unit", unit);
        out.put("occurredAt", at == null ? "（服务端当下时刻）" : at.toString());
        out.put("note", note);
        out.put("noteToModel", "把上面这些照实念一遍给用户（时间没传就说「按现在记的」）。"
                + "**不要说「已经记好了」** —— 用户还要在界面上点一次确认。");
        return out;
    }

    private AiTool updateConsumableLine() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "id": { "type": "string", "description": "要改的那条 id（来自 listFmConsumableLines）" },
                    "siteId": { "type": "string", "description": "改成别的机房（可选，传机房 id）" },
                    "consumableName": { "type": "string", "description": "改名称（可选）" },
                    "qty": { "type": "number", "description": "改数量（可选，要大于 0）" },
                    "unit": { "type": "string", "description": "改单位（可选）" },
                    "occurredAt": { "type": "string", "description": "改发生时间（可选，2026-10-09 或 2026-10-09T14:30:00）" },
                    "note": { "type": "string", "description": "改备注（可选）" }
                  },
                  "required": ["id"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "updateFmConsumableLine",
                "改一条**耗材登记**。**只传要改的字段**，没传的保持原样。"
                        + "改之前先用 listFmConsumableLines 把那条找出来，命中多条时让用户挑，别自己选。",
                schema, CAP_FACILITY_MAINTENANCE, SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> doUpdateConsumable(args),
                null, this::consumableUpdatedDetail);
    }

    private Map<String, Object> doUpdateConsumable(JsonNode args) {
        String id = text(args, "id");
        if (id.isEmpty()) {
            return Map.of("ok", false, "reason", "要改哪一条？先 listFmConsumableLines 找出来，让用户确认是它。");
        }
        List<String> changed = new ArrayList<>();
        BigDecimal qty = null;
        if (args.path("qty").isNumber()) {
            qty = BigDecimal.valueOf(args.path("qty").asDouble());
            if (qty.signum() <= 0) {
                return Map.of("ok", false, "reason", "数量要大于 0。");
            }
            changed.add("数量");
        }
        String siteId = present(args, "siteId") ? text(args, "siteId") : null;
        String name = present(args, "consumableName") ? text(args, "consumableName") : null;
        String unit = present(args, "unit") ? text(args, "unit") : null;
        String note = present(args, "note") ? text(args, "note") : null;
        LocalDateTime at;
        try {
            at = present(args, "occurredAt") ? parseAt(text(args, "occurredAt")) : null;
        } catch (IllegalArgumentException e) {
            return Map.of("ok", false, "reason", e.getMessage());
        }
        if (siteId != null) changed.add("机房");
        if (name != null) changed.add("名称");
        if (unit != null) changed.add("单位");
        if (at != null) changed.add("发生时间");
        if (note != null) changed.add("备注");
        if (changed.isEmpty()) {
            return Map.of("ok", false, "reason", "没说要改什么。问清要改哪一项再改。");
        }
        try {
            service.updateConsumableLine(id, blank(siteId), blank(name), qty, blank(unit), at, blank(note));
        } catch (IllegalArgumentException e) {
            return Map.of("ok", false, "reason", "没改成：" + e.getMessage());
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("id", id);
        out.put("changed", changed);
        out.put("noteToModel", "告诉用户要改哪几项（上面这些）。这个口子只能「改成某个值」，"
                + "把备注/单位**清空**改不了 —— 用户要清空就说到页面上做。");
        return out;
    }

    private AiTool deleteConsumableLine() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "id": { "type": "string", "description": "要删的那条 id（来自 listFmConsumableLines）" }
                  },
                  "required": ["id"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "deleteFmConsumableLine",
                "删掉一条**耗材登记**。真删，删了找不回来。"
                        + "删之前先 listFmConsumableLines 把那条找出来核对（机房、名称、时间），"
                        + "命中多条时让用户挑，**别自己挑一条删掉**。",
                schema, CAP_FACILITY_MAINTENANCE, SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> {
                    String id = text(args, "id");
                    if (id.isEmpty()) {
                        return Map.of("ok", false, "reason", "要删哪一条？先 listFmConsumableLines 找出来让用户确认。");
                    }
                    try {
                        service.deleteConsumableLine(id);
                    } catch (IllegalArgumentException e) {
                        return Map.of("ok", false, "reason", "没删掉：" + e.getMessage());
                    }
                    return Map.of("ok", true, "id", id,
                            "noteToModel", "告诉用户删的是哪一条（机房 + 名称 + 时间）。");
                },
                null, a -> "删除一条耗材登记");
    }

    // ── 更换记录 ──

    private AiTool listReplacementRecords() {
        return new AiTool(
                "listFmReplacementRecords",
                "查**更换记录**台账（检查维护页「更换」页签那张表）。"
                        + "回答「某机房上次换初效是什么时候 / 换了哪些级别」、以及**改删之前先把那条找出来拿 id**，都用它。"
                        + "行里的 `daysSincePrevious` 是服务端算的「距上次多少天」，照实报别自己算。",
                listSchema(), CAP_FACILITY_MAINTENANCE, SideEffect.READ,
                (ctx, args) -> listLedger(args, (siteId, kw, from, to, page, size) ->
                        service.listReplacementRecords(siteId, kw, from, to, page, size)));
    }

    private AiTool createReplacementRecords() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "siteId": { "type": "string", "description": "机房 id，**必填**。不知道就先调 listFmOptions(kind=sites) 问用户" },
                    "filterTypes": {
                      "type": "array",
                      "items": { "type": "string" },
                      "description": "更换类型，**必填且至少一项**，只能取预设（初效/中效/高效，来自 listFmOptions(kind=replacementTypes)）。一次换了好几级就都放进来"
                    },
                    "replacedAt": { "type": "string", "description": "更换时间。用户说「今天/刚才」就**别传**；说了具体日期才传" },
                    "note": { "type": "string", "description": "备注（可选）" }
                  },
                  "required": ["siteId", "filterTypes"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "createFmReplacementRecords",
                "记**更换记录**（检查维护「更换」页签的新增）：某机房换了哪一级过滤器。"
                        + "用户说「记录今日更换机房过滤网」「甲机房今天换了初效和中效」时用它。"
                        + "**级别只能取预设**，用户没说级别就先问（listFmOptions(kind=replacementTypes)），"
                        + "别把「过滤网」当成类型写进去；多级一起换就一次都放进 filterTypes。",
                schema, CAP_FACILITY_MAINTENANCE, SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> doCreateReplacement(ctx, args),
                null, this::replacementCreatedDetail);
    }

    private Map<String, Object> doCreateReplacement(AiToolContext ctx, JsonNode args) {
        String siteId = text(args, "siteId");
        if (siteId.isEmpty()) {
            return Map.of("ok", false, "reason",
                    "还差机房（地点）。先调 listFmOptions(kind=sites) 把机房做成选项问用户，拿到 id 再记。");
        }
        List<String> types = new ArrayList<>();
        JsonNode arr = args.path("filterTypes");
        if (arr.isArray()) {
            for (JsonNode t : arr) {
                String s = t.asText("").trim();
                if (!s.isEmpty() && !types.contains(s)) types.add(s);
            }
        }
        if (types.isEmpty()) {
            return Map.of("ok", false, "reason",
                    "还差更换类型。先调 listFmOptions(kind=replacementTypes) 让用户在预设里挑，"
                            + "或者问清他换的是哪一级（初效 / 中效 / 高效）。");
        }
        LocalDateTime at;
        try {
            at = parseAt(text(args, "replacedAt"));
        } catch (IllegalArgumentException e) {
            return Map.of("ok", false, "reason", e.getMessage());
        }
        String note = text(args, "note");
        List<String> ids = new ArrayList<>();
        try {
            // 一次换了好几级 = 多条台账行（与页面的批量新增同一口径）
            for (String t : types) {
                Map<String, Object> r = service.createReplacementRecord(siteId, t, at, blank(note),
                        ctx.actor().getId());
                if (r != null) ids.add(str(r.get("id")));
            }
        } catch (IllegalArgumentException e) {
            return Map.of("ok", false, "reason", "没记成：" + e.getMessage());
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("ids", ids);
        out.put("siteName", siteName(siteId));
        out.put("filterTypes", types);
        out.put("replacedAt", at == null ? "（服务端当下时刻）" : at.toString());
        out.put("noteToModel", "照实告诉用户记了哪几级、哪个机房、什么时候（时间没传就说「按现在记的」）。"
                + "**不要说「已经记好了」** —— 用户还要在界面上点一次确认。");
        return out;
    }

    private AiTool updateReplacementRecord() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "id": { "type": "string", "description": "要改的那条 id（来自 listFmReplacementRecords）" },
                    "siteId": { "type": "string", "description": "改成别的机房（可选，传机房 id）" },
                    "filterType": { "type": "string", "description": "改成另一个级别（可选，只能取预设）" },
                    "replacedAt": { "type": "string", "description": "改更换时间（可选）" },
                    "note": { "type": "string", "description": "改备注（可选）" }
                  },
                  "required": ["id"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "updateFmReplacementRecord",
                "改一条**更换记录**。**只传要改的字段**。"
                        + "注意：一条记录只有一个级别 —— 用户说「这条其实是中效不是初效」是改；"
                        + "说「还要补记一级高效」是**再记一条**，用 createFmReplacementRecords。",
                schema, CAP_FACILITY_MAINTENANCE, SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> doUpdateReplacement(args),
                null, this::replacementUpdatedDetail);
    }

    private Map<String, Object> doUpdateReplacement(JsonNode args) {
        String id = text(args, "id");
        if (id.isEmpty()) {
            return Map.of("ok", false, "reason", "要改哪一条？先 listFmReplacementRecords 找出来让用户确认。");
        }
        List<String> changed = new ArrayList<>();
        String siteId = present(args, "siteId") ? text(args, "siteId") : null;
        String type = present(args, "filterType") ? text(args, "filterType") : null;
        String note = present(args, "note") ? text(args, "note") : null;
        LocalDateTime at;
        try {
            at = present(args, "replacedAt") ? parseAt(text(args, "replacedAt")) : null;
        } catch (IllegalArgumentException e) {
            return Map.of("ok", false, "reason", e.getMessage());
        }
        if (siteId != null) changed.add("机房");
        if (type != null) changed.add("更换类型");
        if (at != null) changed.add("更换时间");
        if (note != null) changed.add("备注");
        if (changed.isEmpty()) {
            return Map.of("ok", false, "reason", "没说要改什么。问清要改哪一项再改。");
        }
        try {
            service.updateReplacementRecord(id, blank(siteId), blank(type), at, blank(note));
        } catch (IllegalArgumentException e) {
            return Map.of("ok", false, "reason", "没改成：" + e.getMessage());
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("id", id);
        out.put("changed", changed);
        out.put("noteToModel", "告诉用户改了哪几项。要补记另一级就再调 createFmReplacementRecords，"
                + "别在同一条上叠加。");
        return out;
    }

    private AiTool deleteReplacementRecord() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "id": { "type": "string", "description": "要删的那条 id（来自 listFmReplacementRecords）" }
                  },
                  "required": ["id"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "deleteFmReplacementRecord",
                "删掉一条**更换记录**。真删，删了找不回来。"
                        + "删之前先 listFmReplacementRecords 把那条找出来核对（机房、级别、时间），"
                        + "命中多条时让用户挑，**别自己挑一条删掉**。",
                schema, CAP_FACILITY_MAINTENANCE, SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> {
                    String id = text(args, "id");
                    if (id.isEmpty()) {
                        return Map.of("ok", false, "reason", "要删哪一条？先 listFmReplacementRecords 找出来让用户确认。");
                    }
                    try {
                        service.deleteReplacementRecord(id);
                    } catch (IllegalArgumentException e) {
                        return Map.of("ok", false, "reason", "没删掉：" + e.getMessage());
                    }
                    return Map.of("ok", true, "id", id,
                            "noteToModel", "告诉用户删的是哪一条（机房 + 级别 + 时间）。");
                },
                null, a -> "删除一条更换记录");
    }

    // ── 确认框上那一行字（给人看的，不是给模型的） ──

    private String consumableCreatedDetail(JsonNode args) {
        String unit = text(args, "unit");
        return "记一条耗材消耗：「" + text(args, "consumableName") + "」"
                + num(args, "qty") + unit + " @ " + siteName(text(args, "siteId"));
    }

    private String consumableUpdatedDetail(JsonNode args) {
        return "改一条耗材登记（" + siteName(text(args, "siteId")) + "）";
    }

    private String replacementCreatedDetail(JsonNode args) {
        List<String> types = new ArrayList<>();
        JsonNode arr = args.path("filterTypes");
        if (arr.isArray()) {
            for (JsonNode t : arr) {
                String s = t.asText("").trim();
                if (!s.isEmpty()) types.add(s);
            }
        }
        return "记更换记录：" + (types.isEmpty() ? "（未选级别）" : String.join("、", types))
                + " @ " + siteName(text(args, "siteId"));
    }

    private String replacementUpdatedDetail(JsonNode args) {
        return "改一条更换记录（" + siteName(text(args, "siteId")) + "）";
    }

    // ── 内部 ──

    /** 两张台账的查询形状一样：机房 + 关键词 + 时间段 + 条数。 */
    private String listSchema() {
        return """
                {
                  "type": "object",
                  "properties": {
                    "siteId": { "type": "string", "description": "只看某个机房（id，来自 listFmOptions(kind=sites)）" },
                    "keyword": { "type": "string", "description": "关键词：名称（耗材）或级别（更换）里含这个片段（可选）" },
                    "from": { "type": "string", "description": "只看这个日期之后的（含当天），2026-10-01" },
                    "to": { "type": "string", "description": "只看这个日期之前的（含当天）" },
                    "limit": { "type": "integer", "description": "最多回几条，默认 20，上限 40" }
                  },
                  "additionalProperties": false
                }""";
    }

    private interface LedgerFetcher {
        Map<String, Object> fetch(String siteId, String keyword, LocalDate from, LocalDate to, int page, int size);
    }

    /**
     * 两张台账的列表查询。
     *
     * <p>关键词与时间段**在 SQL 里筛**（服务层那两条重载），所以 `matchedTotal` 是**真命中数**，
     * `truncated` 也就是「真命中比回给你的多」—— 不是「我在一页里没找到」。
     * 早先是在 Java 里筛一页，于是「筛出来只有两条」看起来像「一共就两条」（真机 2026-10-09 撞到）。
     */
    private Map<String, Object> listLedger(JsonNode args, LedgerFetcher fetcher) {
        int limit = clamp(args.path("limit").asInt(20), 1, MAX_ROWS);
        String siteId = text(args, "siteId");
        String kw = text(args, "keyword");
        LocalDate from = parseDate(text(args, "from"));
        LocalDate to = parseDate(text(args, "to"));

        Map<String, Object> pageData = fetcher.fetch(siteId.isEmpty() ? null : siteId,
                kw.isEmpty() ? null : kw, from, to, 1, limit);
        List<Map<String, Object>> rows = orEmpty(rowsOf(pageData));
        int total = pageData == null ? rows.size() : num(pageData.get("total"));
        boolean truncated = total > rows.size();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("matchedTotal", total);
        out.put("returned", rows.size());
        out.put("truncated", truncated);
        out.put("rows", rows.stream().map(FacilityMaintenanceToolPack::trimRow).toList());
        if (truncated) {
            out.put("note", "命中的共 " + total + " 条，只回了最近 " + rows.size() + " 条。"
                    + "用户要找的那条可能没回给你 —— 让他给个时间段或机房再查一次，"
                    + "**不要**断言「一共就这些」。要做排行/趋势用 summarizeFmConsumableUsage，别拿这些行去数。");
        }
        return out;
    }

    /** 只把模型用得上的字段回出去（少传点 token）。 */
    private static Map<String, Object> trimRow(Map<String, Object> r) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", str(r.get("id")));
        row.put("siteName", firstStr(r, "siteName"));
        String name = firstStr(r, "consumableName");
        if (!name.isEmpty()) {
            row.put("consumableName", name);
            row.put("qty", str(r.get("qty")));
            row.put("unit", firstStr(r, "unit"));
            row.put("occurredAt", firstStr(r, "occurredAt", "occurred_at"));
        } else {
            row.put("filterType", firstStr(r, "filterType"));
            row.put("replacedAt", firstStr(r, "replacedAt", "replaced_at"));
            row.put("daysSincePrevious", r.get("daysSincePrevious"));
        }
        row.put("note", firstStr(r, "note"));
        row.put("createdByName", firstStr(r, "createdByName"));
        return row;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> rowsOf(Map<String, Object> page) {
        if (page == null) return List.of();
        Object rows = page.get("rows");
        return rows instanceof List ? (List<Map<String, Object>>) rows : List.of();
    }

    private String siteName(String siteId) {
        if (siteId == null || siteId.isBlank()) return "（未选机房）";
        for (Map<String, Object> s : orEmpty(service.listSites(true))) {
            if (siteId.equals(str(s.get("id")))) return firstStr(s, "name");
        }
        return siteId;
    }

    /** 时间：只给了日期就当当天 0 点；给了到分钟的就补秒。传空 = 交给服务端记「现在」。 */
    private static LocalDateTime parseAt(String s) {
        if (s == null || s.isBlank()) return null;
        String t = s.trim().replace(' ', 'T');
        try {
            if (t.length() == 10) return LocalDate.parse(t).atStartOfDay();
            if (t.length() == 16) return LocalDateTime.parse(t + ":00");
            return LocalDateTime.parse(t);
        } catch (Exception e) {
            throw new IllegalArgumentException(
                    "时间看不懂：「" + s + "」。要 2026-10-09 或 2026-10-09T14:30:00 这种写法。");
        }
    }

    private static LocalDate parseDate(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            String t = s.trim();
            return LocalDate.parse(t.length() >= 10 ? t.substring(0, 10) : t);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 空串一律按「没填」处理 —— 与页面一致（页面把留空的字段当没传）。
     *
     * <p>这不等于「清空」：服务端的更新口子是 {@code COALESCE(?,col)}，传 null 是**保持原样**。
     * 所以这个口子改不掉「把备注清空」这件事，只能改成别的值 —— 工具结果里如实告诉模型了。
     */
    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static boolean present(JsonNode args, String field) {
        JsonNode n = args == null ? null : args.path(field);
        return n != null && !n.isMissingNode() && !n.isNull();
    }

    private static String num(JsonNode args, String field) {
        JsonNode n = args == null ? null : args.path(field);
        if (n == null || !n.isNumber()) return "";
        return BigDecimal.valueOf(n.asDouble()).stripTrailingZeros().toPlainString();
    }

    /** 结果里的数字取出来（缺失按 0）。 */
    private static int num(Object o) {
        return o instanceof Number n ? n.intValue() : 0;
    }

    private static String text(JsonNode args, String field) {
        JsonNode n = args == null ? null : args.path(field);
        return n == null || !n.isTextual() ? "" : n.asText("").trim();
    }

    private static String firstStr(Map<String, Object> row, String... keys) {
        for (String k : keys) {
            Object v = row.get(k);
            if (v != null && !String.valueOf(v).isBlank()) return String.valueOf(v).trim();
        }
        return "";
    }

    private static <T> List<T> orEmpty(List<T> l) {
        return l == null ? List.of() : l;
    }

    private static boolean contains(String hay, String needle) {
        return hay != null && needle != null && !needle.isEmpty()
                && hay.toLowerCase(Locale.ROOT).contains(needle.toLowerCase(Locale.ROOT));
    }

    /** 关键词筛选：**没给关键词就是全都要**（{@link #contains} 对空串恒 false，别拿它当筛子）。 */
    private static boolean matches(String hay, String needle) {
        return needle == null || needle.isEmpty() || contains(hay, needle);
    }

    private static String str(Object o) {
        if (o == null) return "";
        String s = String.valueOf(o).trim();
        return "null".equalsIgnoreCase(s) ? "" : s;
    }

    private static int clamp(int v, int min, int max) {
        return Math.min(Math.max(v, min), max);
    }
}
