package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.AiView;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.referencedata.dto.RefOrderLineView;
import com.example.demo.modules.referencedata.dto.RefOrderLogView;
import com.example.demo.modules.referencedata.dto.RefOrderView;
import com.example.demo.modules.referencedata.dto.RefOrderQuery;
import com.example.demo.modules.referencedata.service.RefOrderAccessPolicy;
import com.example.demo.modules.referencedata.service.ReferenceDataService;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

/**
 * 动物订购审核（{@code /#/console/admin/animal-order-review}）的工具包 —— 查询 + 审批两条链。
 *
 * <h2>权限：**不由角色决定"能看多少"**</h2>
 * 页面门槛是 STAFF，但「看全量还是只看本组」由 {@link RefOrderAccessPolicy} 判：
 * 超管或持**业务标签**的人才看全量，**其余人由服务端强制收窄到本人课题组**（客户端传的课题组一律被覆盖）。
 * 所以本包分两个能力码，且都**调页面同一个方法**（网关设计 §7.1）：
 * <ul>
 *   <li>{@code ai.order.query} = STAFF 起（页面可达）；范围收窄交给服务端，工具不自己判；</li>
 *   <li>{@code ai.order.review} = {@code RefOrderAccessPolicy#canReview}（超管/业务标签）。</li>
 * </ul>
 * 「业务」是**人员标签不是角色**，{@code RoleEnum} 的等级比较表达不了它 —— 别改成阈值判断。
 *
 * <h2>身份是两道，别只做一道</h2>
 * 平台里「谁在用」和「他是什么身份」是两件事，这里都要过：
 * <ol>
 *   <li><b>视角（学生 / 教职工）</b>：页面上的审批按钮条件是 {@code !isStudent && canReview} ——
 *       **学生账号一律不给审**，哪怕他的角色档是 STAFF 级。这一层由 {@link #views()} 声明 STAFF 挡在
 *       注入之前（判据 {@code CageModeVisibilityService#isStudent}，与前端 {@code isStudentAccount()} 同源）。</li>
 *   <li><b>人员身份标识</b>：教职工里也只有持**业务**标签的人能审批/看全量
 *       （{@code PersonIdentityService#isBusiness}）；其余人查询会被服务端收窄到本人课题组、
 *       看单张详情还要过「本人课题组 ∪ 本人提交」（{@code isOrderVisibleTo}）。</li>
 * </ol>
 * 两处都**不在工具里重写** —— 复用页面那套方法，等于哪天口径变了工具自动跟着变。
 *
 * <h2>审批有下游动作，不只是改个字段</h2>
 * 改状态会触发笼位落地（通过 = 填表 + 笼位 2→3 进饲养中；驳回/取消 = 释放预定）并清理编辑回填行。
 * 所以审批是写操作（C 级，服务端挂起等确认），且**状态迁移由服务端校验**：
 * 待处理→批准/驳回/取消；已批准→完成/取消/驳回；已完成/已驳回/已取消**是终态，不能再改**。
 *
 * <h2>不接的</h2>
 * 编辑待处理单（回填购物车那套）、从 ARO 导入、导出 Excel —— 前者是「购物车 + 原单替换」的多步流程，
 * 后两者是批量/文件动作，都在页面里做更稳。
 */
@Component
public class AnimalOrderToolPack implements AiToolPack {

    public static final String CAP_ORDER_QUERY = "ai.order.query";
    public static final String CAP_ORDER_REVIEW = "ai.order.review";

    /** 一次最多回几张单。 */
    private static final int DEFAULT_PAGE_SIZE = 20;
    private static final int MAX_PAGE_SIZE = 50;
    /** 候选一次最多回几条（再多就截断并报总数）。 */
    private static final int MAX_OPTIONS = 30;
    /** 候选最多几个做芯片。 */
    private static final int CHIP_MAX = 6;

    /** 状态码 → 给人看的话（与页面 STATUS_LABELS 同口径）。 */
    private static final Map<String, String> STATUS_ZH = Map.of(
            "PENDING", "待处理", "APPROVED", "已批准", "REJECTED", "已驳回",
            "COMPLETED", "已完成", "CANCELLED", "已取消");

    /** 筛选候选白名单 —— 与 Service 里那张表一字不差（列名写错服务端会直接拒）。 */
    private static final Map<String, String> FILTER_COLUMNS = Map.of(
            "供应商", "supplier_name", "品系", "strain_name", "领用人", "collector_name",
            "房间", "pickup_room_name", "课题组", "project_group_name", "AUP编号", "register_no");

    /** 「审核决定」→ 目标状态。与页面上的三个按钮一一对应。 */
    private static final Map<String, String> DECISIONS = Map.of(
            "批准", "APPROVED", "驳回", "REJECTED", "标记完成", "COMPLETED");

    private final ReferenceDataService referenceDataService;
    private final RefOrderAccessPolicy accessPolicy;

    public AnimalOrderToolPack(ReferenceDataService referenceDataService,
                               RefOrderAccessPolicy accessPolicy) {
        this.referenceDataService = referenceDataService;
        this.accessPolicy = accessPolicy;
    }

    @Override
    public String packKey() {
        return "animalOrder";
    }

    @Override
    public String displayName() {
        return "动物订购审核";
    }

    /** 教职工后台页。 */
    @Override
    public Set<AiView> views() {
        return Set.of(AiView.STAFF);
    }

    @Override
    public Set<String> routeHints() {
        // 「订购 / 订单 / 买动物 / 到货」是这个域的说法。
        // 别用「动物」这种宽词（笼架、实验记录那边也在说动物）。
        return Set.of("订购", "订单", "订购审核", "买动物", "到货", "品系", "animalOrder");
    }

    @Override
    public String defaultPrompt() {
        return """
                动物订购审核（#/console/admin/animal-order-review）的口径：
                - 这个页面管的是**订购单**：查单、看单的来龙去脉、以及**审批**（批准 / 驳回 / 标记完成）。
                  订单的五种状态：待处理 / 已批准 / 已驳回 / 已完成 / 已取消。
                - **「还没审批的」= 状态为待处理**；**「已完成的」= 已完成**（页面上的两个页签就是这么分的：
                  待处理页签筛待处理，已完成页签是「排除待处理」）。
                - 查询的全部筛选项：**状态 / 排除某状态 / 课题组 / 品系 / 供应商 / 房间 / 领用人 /
                  AUP 编号 / 单号 / 来源 / 校区 / 日期区间 / 只要预约单或排除预约单**。
                  带筛选条件的查询**传给工具**（工具会把条件落到 SQL），**不要**自己拉一大把回来再筛 ——
                  列表是分页返回的，自己筛会漏。
                - **筛选值不确定时先要候选**：用户报的名字写法不定（课题组 / 品系 / 供应商 / 领用人 / 房间）
                  时，先用候选工具把平台里的**真实取值**列出来（会做成可点选项让用户挑），
                  别拿用户原话硬传 —— 名字差一个字就查成空。
                - **「小鼠使用情况」这类要当心**：平台里的**品系是具体品系名**
                  （C57BL/6、BALB/c、ICR、新西兰兔 这种），**没有「小鼠」这个物种筛选项**。
                  用户说物种时，要么先给品系候选让他挑，要么如实说「品系要具体到品系名」，别编一个筛不上。
                - **要审批就直接调 reviewAnimalOrder**（把用户给的单号/名称原样传进去）。它会在**挂起确认之前**
                  先判断这张单是否唯一：**命中多张或找不到时，它会把候选做成可点芯片交回来** ——
                  所以**不要**先自己去 listAnimalOrders 列一遍再在正文里念单号（那样用户只能手打单号，
                  拿不到可点选项，真机踩过）。只在「用户还没说要批哪张」时才先列给他挑。
                - 审批是**真的会往下走**的：批准会让笼位填表并进入饲养中，驳回/取消会释放笼位预定。
                  所以服务端会挂起等用户点确认，**正文里不要说「已经批准了」**。
                - 状态不能倒着改：**已完成 / 已驳回 / 已取消是终态**，用户要改这类单就如实说改不了。
                - **审批资格看的是身份标识，不是角色**：页面上的条件是「**学生账号不给审** ＋ 持**业务**标签的人才能审」，
                  所以管理员也未必有资格。能力闸会先把没资格的人挡住 —— 你不要因为用户自称管理员就去试，
                  被挡了就如实说「这块要业务身份的账号来批」。""";
    }

    @Override
    public Map<String, Predicate<User>> capabilities() {
        return Map.of(
                CAP_ORDER_QUERY, user -> user.getRole() != null
                        && user.getRole().getLevel() >= RoleEnum.STAFF.getLevel(),
                // 与 Controller 的审批入口同一个判据（超管或「业务」标签）
                CAP_ORDER_REVIEW, accessPolicy::canReview);
    }

    @Override
    public List<AiTool> tools() {
        return List.of(listOrders(), listFilterOptions(), getOrderDetail(), reviewOrder());
    }

    // ── 一、查询订单（页面上的筛选项全带上） ──

    private AiTool listOrders() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "status": { "type": "string", "enum": ["PENDING","APPROVED","REJECTED","COMPLETED","CANCELLED"], "description": "只看某个状态。问「还没审批的」传 PENDING" },
                    "statusNot": { "type": "string", "enum": ["PENDING","APPROVED","REJECTED","COMPLETED","CANCELLED"], "description": "排除某状态。页面「已完成」页签用的是 statusNot=PENDING" },
                    "projectGroup": { "type": "string", "description": "课题组全称（不确定写法先用 listAnimalOrderFilterOptions 要候选）" },
                    "strain": { "type": "string", "description": "**品系**（具体品系名，如 C57BL/6），不是「小鼠」这种物种" },
                    "supplier": { "type": "string", "description": "供应商" },
                    "room": { "type": "string", "description": "投递房间" },
                    "collector": { "type": "string", "description": "领用人" },
                    "aup": { "type": "string", "description": "AUP 编号（register_no）" },
                    "sn": { "type": "string", "description": "订单号" },
                    "source": { "type": "string", "description": "来源" },
                    "campus": { "type": "string", "description": "校区" },
                    "from": { "type": "string", "description": "提交日期起 yyyy-MM-dd" },
                    "to": { "type": "string", "description": "提交日期止 yyyy-MM-dd" },
                    "isPreorder": { "type": "string", "enum": ["1","0"], "description": "1=只要预约单；0=排除预约单；不传=全部" },
                    "pageSize": { "type": "integer", "description": "最多回几张单，默认 20，上限 50" }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listAnimalOrders",
                "查**订购单**（按页面那些筛选项：状态 / 课题组 / 品系 / 供应商 / 房间 / 领用人 / AUP / 单号 / 日期等）。"
                        + "问「还有哪些订单没审批」用 status=PENDING；问「这个课题组订了什么」用 projectGroup。"
                        + "**看得出有多少张、各是什么状态**；要看某张单的物品明细与操作记录用 getAnimalOrderDetail。",
                schema, CAP_ORDER_QUERY, SideEffect.READ,
                (ctx, args) -> {
                    int size = clamp(args.path("pageSize").asInt(DEFAULT_PAGE_SIZE), 1, MAX_PAGE_SIZE);
                    RefOrderQuery q = buildQuery(args);
                    User user = ctx.actor();
                    boolean all = accessPolicy.canSeeAll(user);
                    Map<String, Object> data = all
                            ? referenceDataService.listAllOrders(1, size, q)
                            : referenceDataService.listMyGroupOrders(user.getId(), 1, size, q);
                    List<Map<String, Object>> rows = new ArrayList<>();
                    Object raw = data == null ? null : data.get("list");
                    if (raw instanceof List<?> list) {
                        for (Object o : list) {
                            if (o instanceof RefOrderView v) rows.add(describeOrder(v));
                        }
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("scope", all ? "全部订单" : "仅本人课题组（服务端强制收窄）");
                    out.put("total", data == null ? rows.size() : data.get("total"));
                    out.put("returned", rows.size());
                    out.put("orders", rows);
                    if (rows.isEmpty()) {
                        out.put("note", "这个条件下没有订单。**如实说没有**，并提醒可能是筛选值写法不对"
                                + "（先用 listAnimalOrderFilterOptions 要候选）；不要用「最近没什么订购」这种话糊过去");
                    } else if (data != null && numOf(data.get("total")) > rows.size()) {
                        out.put("note", "共 " + data.get("total") + " 张，这里只回了前 " + rows.size()
                                + " 张。**要如实说「共 N 张」**，让用户加条件收窄");
                    }
                    return out;
                });
    }

    // ── 二、筛选候选（用户说不准写法时 → 可点选项） ──

    private AiTool listFilterOptions() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "column": {
                      "type": "string",
                      "enum": ["课题组","品系","供应商","领用人","房间","AUP编号"],
                      "description": "要列哪一列的候选值"
                    }
                  },
                  "required": ["column"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listAnimalOrderFilterOptions",
                "列某一列的**平台真实取值**（课题组 / 品系 / 供应商 / 领用人 / 房间 / AUP 编号）。"
                        + "用户报的名字不确定写法、或者你拿不准该传哪个值时先用它 —— 命中多个会做成可点选项。",
                schema, CAP_ORDER_QUERY, SideEffect.READ,
                (ctx, args) -> {
                    String zh = text(args, "column");
                    String column = FILTER_COLUMNS.get(zh);
                    if (column == null) {
                        return Map.of("ok", false, "reason", "只能列这几列：" + String.join(" / ", FILTER_COLUMNS.keySet()));
                    }
                    User user = ctx.actor();
                    Result<List<String>> res = accessPolicy.canSeeAll(user)
                            ? referenceDataService.distinctFilterValues(column)
                            : referenceDataService.distinctMyGroupFilterValues(user.getId(), column);
                    if (res == null || !Boolean.TRUE.equals(res.getSuccess())) {
                        return Map.of("ok", false, "reason", "取候选失败："
                                + (res == null || res.getMessage() == null ? "未知" : res.getMessage()));
                    }
                    List<String> values = res.getData() == null ? List.of() : res.getData();
                    List<Map<String, Object>> all = new ArrayList<>();
                    for (String v : values) {
                        if (v != null && !v.isBlank()) all.add(option(v.trim(), v.trim()));
                    }
                    // **候选必须截断**：课题组这一列在全站有上百个，整份塞给模型既读不进去、
                    // 又把这一轮的 token 顶到十万级（真机踩过：147 个组 → 单轮 98k）。
                    boolean truncated = all.size() > MAX_OPTIONS;
                    List<Map<String, Object>> options = truncated
                            ? new ArrayList<>(all.subList(0, MAX_OPTIONS)) : all;
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("column", zh);
                    out.put("total", all.size());
                    out.put("values", options);
                    if (all.isEmpty()) {
                        out.put("note", "这一列现在没有候选值（可能确实没数据）。**如实说没有**，别编");
                    } else if (all.size() <= CHIP_MAX) {
                        out.put("choices", all);
                        out.put("choicesTitle", "选哪个" + zh + "？");
                    } else if (truncated) {
                        out.put("note", "这一列共 " + all.size() + " 个候选，这里只回了前 " + MAX_OPTIONS
                                + " 个 —— **如实说「共 N 个、列不全」**，并让用户给个名字片段再筛一次");
                    } else {
                        out.put("note", "候选较多（" + all.size() + " 个），没做芯片 —— "
                                + "让用户给个名字片段，或从上面这份清单里挑一个再说");
                    }
                    return out;
                });
    }

    // ── 三、某张单的来龙去脉（明细 + 操作记录） ──

    private AiTool getOrderDetail() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "order": { "type": "string", "description": "订单 id 或订单号（单号可能对应多张单，命中多张会交回候选）" }
                  },
                  "required": ["order"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "getAnimalOrderDetail",
                "看**某一张订购单**的明细（品系、规格、数量、供应商、领用人、投递房间、投递周期、取走还是饲养）"
                        + "**和它的操作记录**（谁什么时候改了什么状态）。用户问「这张单里订了什么 / 谁批的 / 怎么变的」用它。",
                schema, CAP_ORDER_QUERY, SideEffect.READ,
                (ctx, args) -> {
                    OrderLookup lk = resolveOrder(ctx.actor(), text(args, "order"));
                    if (lk.error != null) return lk.error;
                    RefOrderView v = lk.order;
                    if (!accessPolicy.canSeeAll(ctx.actor())
                            && !referenceDataService.isOrderVisibleTo(v.getId(), ctx.actor().getId())) {
                        return Map.of("ok", false, "reason", "这张单不在你的可见范围内（只有本人课题组/本人提交的单可看）");
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("order", describeOrder(v));
                    List<RefOrderLogView> lr = referenceDataService.getOrderLogs(v.getId());
                    List<Map<String, Object>> logs = new ArrayList<>();
                    if (lr != null) {
                        for (RefOrderLogView log : lr) {
                            if (log == null) continue;
                            Map<String, Object> row = new LinkedHashMap<>();
                            row.put("time", str(log.getCreatedAt()));
                            row.put("action", str(log.getAction()));
                            row.put("operator", str(log.getOperatorName()));
                            row.put("detail", str(log.getDetail()));
                            logs.add(row);
                        }
                    }
                    out.put("logsTotal", logs.size());
                    out.put("logs", logs);
                    return out;
                });
    }

    // ── 四、审批（唯一写操作） ──

    private AiTool reviewOrder() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "order": { "type": "string", "description": "订单 id 或订单号（命中多张会交回候选让用户挑）" },
                    "decision": {
                      "type": "string",
                      "enum": ["批准","驳回","标记完成"],
                      "description": "批准=待处理→已批准（会填笼位表并进入饲养中）；驳回=待处理/已批准→已驳回；标记完成=已批准→已完成"
                    },
                    "reason": { "type": "string", "description": "一句话说明（驳回时用；批准可不填）" }
                  },
                  "required": ["order", "decision"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "reviewAnimalOrder",
                "**审批一张订购单**：批准 / 驳回 / 标记完成。批准会让笼位填表并进入饲养中，"
                        + "驳回会让笼位预定释放 —— 所以服务端会挂起等你点确认，**正文里不要说已经批准了**。"
                        + "**已完成/已驳回/已取消的单是终态，改不了**（服务端会拒）。",
                schema, CAP_ORDER_REVIEW, SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> {
                    String decision = text(args, "decision");
                    String target = DECISIONS.get(decision);
                    if (target == null) {
                        return Map.of("ok", false, "reason", "decision 只能是 批准 / 驳回 / 标记完成");
                    }
                    OrderLookup lk = resolveOrder(ctx.actor(), text(args, "order"));
                    if (lk.error != null) return lk.error;
                    Result<RefOrderView> res = referenceDataService.updateOrderStatus(
                            lk.order.getId(), target, ctx.actor().getId());
                    if (res == null || !Boolean.TRUE.equals(res.getSuccess())) {
                        // 状态迁移非法等业务拒绝原样回给模型，让它如实转述（如「已完成的单改不了」）
                        return Map.of("ok", false, "reason", "没办成："
                                + (res == null || res.getMessage() == null ? "未知" : res.getMessage()));
                    }
                    // 写后回读：拿回来的就是改之后的真实状态
                    RefOrderView after = res.getData();
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("sn", after == null ? str(lk.order.getSn()) : str(after.getSn()));
                    out.put("status", statusZh(after == null ? target : str(after.getStatus())));
                    String reason = text(args, "reason");
                    out.put("note", "确认已收到并已生效：「" + decision + "」已记到这张单上，"
                            + "当前状态是**" + statusZh(after == null ? target : str(after.getStatus())) + "**。"
                            + ("驳回".equals(decision) && !reason.isEmpty() ? "（原因：" + reason + "）" : "")
                            + ("批准".equals(decision) ? "笼位那边已按批准落地。" : ""));
                    return out;
                },
                // **挂起之前**先把「是哪一张单」问清：写操作的挂起发生在执行体之前，
                // 执行体里那套「命中多张就交回候选」永远跑不到（真机踩过：用户先看到
                // 一张「批准 xxx」的确认卡，点完才被告知「命中多张，请挑一张」）。
                (ctx, args) -> resolveBeforeConfirmPickOrder(ctx.actor(), args),
                a -> {
                    RefOrderView lk = resolveOrderQuiet(text(a, "order"));
                    String what = lk == null ? text(a, "order")
                            : ("单号 " + str(lk.getSn()) + "（" + str(lk.getProjectGroupName()) + " · "
                            + statusZh(str(lk.getStatus())) + " · " + lineSummary(lk.getLines()) + "）");
                    return DECISIONS.containsKey(text(a, "decision"))
                            ? text(a, "decision") + " " + what : what;
                });
    }

    // ── 解析与投影 ──

    private static RefOrderQuery buildQuery(JsonNode args) {
        RefOrderQuery q = new RefOrderQuery();
        q.setStatus(oneOf(args, "status"));
        q.setStatusNot(oneOf(args, "statusNot"));
        q.setProjectGroup(text(args, "projectGroup"));
        q.setStrain(text(args, "strain"));
        q.setSupplier(text(args, "supplier"));
        q.setRoom(text(args, "room"));
        q.setCollector(text(args, "collector"));
        q.setAup(text(args, "aup"));
        q.setSn(text(args, "sn"));
        q.setSource(text(args, "source"));
        q.setCampus(text(args, "campus"));
        q.setFrom(text(args, "from"));
        q.setTo(text(args, "to"));
        String pre = text(args, "isPreorder");
        if ("1".equals(pre) || "0".equals(pre)) q.setIsPreorder(Integer.valueOf(pre));
        return q;
    }

    /**
     * 挂起**之前**的先决条件：审批的目标必须是**唯一一张单**。
     *
     * <p>返回 null = 唯一命中，照常进确认；返回带 choices 的结果 = 找不到 / 命中多张，
     * 这一轮不挂起，把候选交给用户点。
     */
    private Object resolveBeforeConfirmPickOrder(User actor, JsonNode args) {
        if (!DECISIONS.containsKey(text(args, "decision"))) {
            return Map.of("ok", false, "reason", "decision 只能是 批准 / 驳回 / 标记完成");
        }
        if (text(args, "order").isEmpty()) {
            return Map.of("ok", false, "reason",
                    "没说是哪张订单。先用 listAnimalOrders 把单号列出来，让用户选一张再批");
        }
        OrderLookup lk = resolveOrder(actor, text(args, "order"));
        return lk.error;
    }

    /** 订单解析结果：要么命中一张，要么把候选交回。 */
    private record OrderLookup(RefOrderView order, Map<String, Object> error) {
    }

    private OrderLookup resolveOrder(User user, String want) {
        if (want == null || want.isBlank()) {
            return new OrderLookup(null, Map.of("ok", false, "reason",
                    "没说是哪张订单。先问用户（可以先用 listAnimalOrders 把单号列出来）"));
        }
        Long id = longOrNull(want);
        if (id != null) {
            RefOrderView v = referenceDataService.getOrder(id);
            if (v != null) {
                return new OrderLookup(v, null);
            }
        }
        // 当单号找：**一张提交可能拆成多张单**，所以单号常常命中多张 —— 命中多张一律交回候选
        RefOrderQuery q = new RefOrderQuery();
        q.setSn(want);
        Map<String, Object> data = accessPolicy.canSeeAll(user)
                ? referenceDataService.listAllOrders(1, CHIP_MAX + 1, q)
                : referenceDataService.listMyGroupOrders(user.getId(), 1, CHIP_MAX + 1, q);
        List<RefOrderView> hits = new ArrayList<>();
        Object raw = data == null ? null : data.get("list");
        if (raw instanceof List<?> list) {
            for (Object o : list) {
                if (o instanceof RefOrderView v) hits.add(v);
            }
        }
        if (hits.isEmpty()) {
            return new OrderLookup(null, Map.of("ok", false, "reason",
                    "没找到订单「" + want + "」。**如实说没找到**，别拿别的单顶上"));
        }
        if (hits.size() == 1) {
            return new OrderLookup(hits.get(0), null);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", false);
        out.put("reason", "「" + want + "」命中 " + hits.size() + " 张单（一张提交按投递房间拆成了多张），"
                + "让用户点一张，**不要自己挑一张去批**");
        List<Map<String, Object>> chips = new ArrayList<>();
        for (RefOrderView v : hits) {
            chips.add(option(str(v.getSn()) + " · " + str(v.getProjectGroupName()) + " · "
                    + statusZh(str(v.getStatus())) + " · " + lineSummary(v.getLines()),
                    String.valueOf(v.getId())));
        }
        out.put("choices", chips);
        out.put("choicesTitle", "哪一张单？");
        return new OrderLookup(null, out);
    }

    /** 确认弹窗用：解析失败不抛，返回 null 让调用方回落原文。 */
    private RefOrderView resolveOrderQuiet(String want) {
        try {
            Long id = longOrNull(want);
            if (id == null) return null;
            return referenceDataService.getOrder(id);
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static Map<String, Object> describeOrder(RefOrderView v) {
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("orderId", v.getId());
        o.put("sn", str(v.getSn()));
        o.put("status", str(v.getStatus()));
        o.put("statusZh", statusZh(str(v.getStatus())));
        o.put("projectGroup", str(v.getProjectGroupName()));
        o.put("submitter", str(v.getSubmitterName()));
        o.put("campus", str(v.getCampus()));
        o.put("aup", str(v.getRegisterNo()));
        o.put("source", str(v.getSource()));
        o.put("submittedAt", v.getSubmittedAt() == null ? null : String.valueOf(v.getSubmittedAt()));
        o.put("estimatedDeliveryDate", v.getEstimatedDeliveryDate() == null
                ? null : String.valueOf(v.getEstimatedDeliveryDate()));
        o.put("isPreorder", v.getIsPreorder() != null && v.getIsPreorder() == 1);
        o.put("totalAmount", v.getTotalAmount());
        o.put("summary", lineSummary(v.getLines()));
        List<Map<String, Object>> lines = new ArrayList<>();
        if (v.getLines() != null) {
            for (RefOrderLineView l : v.getLines()) {
                if (l == null) continue;
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("strain", str(l.getStrainName()));
                row.put("spec", str(l.getSpecName()));
                row.put("qty", l.getQuantity());
                row.put("supplier", str(l.getSupplierName()));
                row.put("collector", str(l.getCollectorName()));
                row.put("room", str(l.getPickupRoomName()));
                row.put("pickupMode", "TAKE".equalsIgnoreCase(str(l.getPickupMode())) ? "取走" : "饲养");
                row.put("deliveryCycle", l.getDeliveryCycle() == null ? null : String.valueOf(l.getDeliveryCycle()));
                lines.add(row);
            }
        }
        o.put("lines", lines);
        return o;
    }

    /** 一张单的物品概览：「C57BL/6 ×50、ICR ×20」。 */
    private static String lineSummary(List<RefOrderLineView> lines) {
        if (lines == null || lines.isEmpty()) return "无明细";
        List<String> parts = new ArrayList<>();
        for (RefOrderLineView l : lines) {
            if (l == null) continue;
            parts.add(str(l.getStrainName()) + " ×" + (l.getQuantity() == null ? 0 : l.getQuantity()));
            if (parts.size() >= 3) { parts.add("…"); break; }
        }
        return String.join("、", parts);
    }

    private static String statusZh(String s) {
        return STATUS_ZH.getOrDefault(s == null ? "" : s, s == null ? "" : s);
    }

    private static Map<String, Object> option(String label, String value) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("label", label);
        m.put("value", value);
        return m;
    }

    private static String oneOf(JsonNode args, String field) {
        String v = text(args, field);
        return STATUS_ZH.containsKey(v) ? v : null;
    }

    private static String text(JsonNode args, String field) {
        JsonNode n = args == null ? null : args.path(field);
        return n == null || !n.isTextual() ? "" : n.asText("").trim();
    }

    private static Long longOrNull(String s) {
        try {
            long v = Long.parseLong(s.trim());
            return v > 0 ? v : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static long numOf(Object o) {
        return o instanceof Number n ? n.longValue() : 0L;
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
