package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.policy.BizDomains;
import com.example.demo.modules.policy.service.CapabilityPolicyService;
import com.example.demo.modules.repair.dto.RepairOrderView;
import com.example.demo.modules.repair.entity.RepairOrder;
import com.example.demo.modules.repair.mapper.RepairOrderMapper;
import com.example.demo.modules.repair.service.RepairOrderService;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

/**
 * 报修单查询工具包（只读）。
 *
 * <p><b>为什么单开一个包</b>：报修是独立域（{@code modules/repair}，页面 {@code /repair/*}），
 * 跟「检查维护」那个包（{@code FacilityMaintenanceToolPack}，管耗材/滤网台账）不是一回事 ——
 * 用户问「报修单」时，之前只能得到「我这轮没有能查报修的工具」（压力测试实测）。
 *
 * <p><b>门开在哪一层</b>：与 {@code RepairOrderController} 的列表接口**同一条判据** ——
 * 能不能看全部走 {@link CapabilityPolicyService#canViewAllPending}（业务域 {@link BizDomains#REPAIR}），
 * 否则只给「本人提交的 + 别人公开的」（{@code listVisible}）。**不自己判角色**，
 * 免得两边口径分叉（笼架那边吃过这个亏：直接调服务会绕过可见性门）。
 *
 * <p>只读，不开写：报修的提交/处理都带照片与流程状态，不适合让模型代按 —— 要让用户去页面办。
 */
@Component
public class RepairToolPack implements AiToolPack {

    public static final String CAP_REPAIR_READ = "ai.repair.read";

    private static final int DEFAULT_LIMIT = 20;
    private static final int MAX_LIMIT = 50;

    /** 状态：中文说法 → 枚举值（页面上的词就是这个）。 */
    private static final Map<String, String> STATUS = Map.of(
            "待处理", "PENDING",
            "处理中", "PROCESSING",
            "已完成", "COMPLETED");
    private static final Map<String, String> STATUS_ZH = Map.of(
            "PENDING", "待处理",
            "PROCESSING", "处理中",
            "COMPLETED", "已完成");

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private final RepairOrderMapper mapper;
    private final RepairOrderService repairService;
    private final CapabilityPolicyService capabilityPolicyService;

    public RepairToolPack(RepairOrderMapper mapper,
                          RepairOrderService repairService,
                          CapabilityPolicyService capabilityPolicyService) {
        this.mapper = mapper;
        this.repairService = repairService;
        this.capabilityPolicyService = capabilityPolicyService;
    }

    @Override
    public String packKey() {
        return "repair";
    }

    @Override
    public String displayName() {
        return "报修单";
    }

    @Override
    public Set<String> routeHints() {
        return Set.of("报修", "报修单", "维修", "维修单", "报修记录");
    }

    @Override
    public String defaultPrompt() {
        return """
                报修单（用户说的「报修 / 维修单」就是它）：
                - 只读：**能查、不能提交、不能处理**。用户要报修或要处理单子，让他去页面上办，别假装能办。
                - `listRepairOrders` 查列表。**能看多少由权限决定，不看你猜**：结果里的 scopedTo 会写明
                  这次是「全部人的」还是「只有他自己的」—— 如实转述这个范围，别把它说成全部。
                - 状态只有三种：待处理 / 处理中 / 已完成。用户说「没处理的」= 待处理。
                - **没有房间/校区/部门筛选**：这个域的表里就没这些字段，用户按房间问就如实说筛不了，
                  可以按时间或状态给他收窄，或者把列表拉回来看 location 字段里写了什么。
                - 单号是长字符串，引用时原样抄，别截断、别改写成数字。""";
    }

    @Override
    public Map<String, Predicate<User>> capabilities() {
        return Map.of(
                // 只读查询：登录（MEMBER 起）即可，跟页面列表接口同档；
                // 「能看多少」在工具里按 canViewAllPending 再收一次，不在这里分叉。
                CAP_REPAIR_READ, user -> user != null && user.getRole() != null
                        && user.getRole().getLevel() >= RoleEnum.MEMBER.getLevel());
    }

    @Override
    public List<AiTool> tools() {
        return List.of(listRepairOrders());
    }

    private AiTool listRepairOrders() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "status": {
                      "type": "string",
                      "enum": ["待处理", "处理中", "已完成", "PENDING", "PROCESSING", "COMPLETED"],
                      "description": "按状态筛；不传 = 全部状态"
                    },
                    "from": { "type": "string", "description": "起始日期 yyyy-MM-dd（按提交时间）" },
                    "to": { "type": "string", "description": "结束日期 yyyy-MM-dd（按提交时间，含当天）" },
                    "scope": {
                      "type": "string",
                      "enum": ["mine", "all"],
                      "description": "mine=只看我提交的；all=看全部（**只有在结果里看到 canSeeAll=true 时才用得上**）。不传=mine"
                    },
                    "limit": { "type": "integer", "description": "最多回几条，默认 20，上限 50" }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listRepairOrders",
                "查报修单列表（状态 / 提交时间 / 范围）。用户问「有哪些报修单」「我的报修处理到哪了」时用它。",
                schema,
                CAP_REPAIR_READ,
                SideEffect.READ,
                (ctx, args) -> {
                    User user = ctx.actor();
                    boolean canSeeAll = capabilityPolicyService.canViewAllPending(user, BizDomains.REPAIR);
                    boolean wantAll = "all".equalsIgnoreCase(text(args, "scope"));
                    // **要全部但没这个权限 → 直接说清**，不静默降级成「只给你自己的」——
                    // 那样用户会以为「全平台就这几张单」。
                    if (wantAll && !canSeeAll) {
                        return Map.of("ok", false, "reason",
                                "你现在只能看自己提交的报修单（看全部要有报修处理权限）。"
                                        + "要看你自己的就说不带范围，要我按状态/时间收窄也行。");
                    }
                    boolean all = wantAll && canSeeAll;

                    String status = normalizeStatus(text(args, "status"));
                    if (status == null && StringUtils.hasText(text(args, "status"))) {
                        return Map.of("ok", false, "reason",
                                "状态只认 待处理 / 处理中 / 已完成（或 PENDING / PROCESSING / COMPLETED）");
                    }
                    String bad = null;
                    LocalDateTime from = parseTime(text(args, "from"), false);
                    LocalDateTime to = parseTime(text(args, "to"), true);
                    if (StringUtils.hasText(text(args, "from")) && from == null) bad = "起始日期格式不对，应是 2026-10-01";
                    if (bad == null && StringUtils.hasText(text(args, "to")) && to == null) bad = "结束日期格式不对，应是 2026-10-01";
                    if (bad != null) {
                        return Map.of("ok", false, "reason", bad);
                    }

                    int limit = Math.min(Math.max(args.path("limit").asInt(DEFAULT_LIMIT), 1), MAX_LIMIT);
                    List<RepairOrder> rows = all
                            ? mapper.listAll(status, from, to, limit, 0)
                            : mapper.listVisible(user.getId(), status, from, to, limit, 0);
                    int total = all
                            ? mapper.countAll(status, from, to)
                            : mapper.countVisible(user.getId(), status, from, to);

                    List<RepairOrderView> views = repairService.toViews(rows == null ? List.of() : rows);
                    List<Map<String, Object>> items = new ArrayList<>();
                    for (RepairOrderView v : views) {
                        Map<String, Object> it = new LinkedHashMap<>();
                        it.put("orderId", v.getId());
                        it.put("status", STATUS_ZH.getOrDefault(v.getStatus(), v.getStatus()));
                        it.put("applicant", v.getApplicantName());
                        it.put("location", v.getLocation());
                        it.put("content", v.getContent());
                        it.put("submittedAt", str(v.getCreateTime()));
                        if (v.getProcessorName() != null) it.put("processor", v.getProcessorName());
                        if (v.getStartTime() != null) it.put("acceptedAt", str(v.getStartTime()));
                        if (v.getFinishTime() != null) it.put("finishedAt", str(v.getFinishTime()));
                        if (StringUtils.hasText(v.getResultRemark())) it.put("result", v.getResultRemark());
                        items.add(it);
                    }

                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("canSeeAll", canSeeAll);
                    // **范围要写明**：用户最容易误以为「列出来的是全部」
                    out.put("scopedTo", all ? "全部人的报修单" : "只有你本人提交的（外加别人设为公开的）");
                    out.put("total", total);
                    out.put("returned", items.size());
                    out.put("repairOrders", items);
                    if (items.isEmpty()) {
                        out.put("note", "这个条件下没有报修单。如实说没有，别猜；可以把时间范围放宽一点再问。");
                    } else if (total > items.size()) {
                        out.put("note", "共 " + total + " 张，这里是最新的 " + items.size()
                                + " 张。要更全就按状态 / 时间收窄，或加大 limit。");
                    }
                    return out;
                });
    }

    /** 中文 / 英文都收；空串 = 不筛（返回 null）；认不出来也返回 null（调用方据 raw 再判一次）。 */
    private static String normalizeStatus(String raw) {
        if (!StringUtils.hasText(raw)) return null;
        String s = raw.trim();
        if (STATUS.containsKey(s)) return STATUS.get(s);
        String up = s.toUpperCase();
        return STATUS_ZH.containsKey(up) ? up : null;
    }

    /** 只给日期时：起点补 00:00:00、终点补 23:59:59（与页面口径一致）。 */
    private static LocalDateTime parseTime(String raw, boolean endOfDay) {
        if (!StringUtils.hasText(raw)) return null;
        String s = raw.trim();
        try {
            if (s.length() == 10) {
                LocalDate d = LocalDate.parse(s, DATE);
                return endOfDay ? d.atTime(23, 59, 59) : d.atStartOfDay();
            }
            return LocalDateTime.parse(s.replace(' ', 'T'));
        } catch (Exception e) {
            return null;
        }
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o);
    }

    private static String text(JsonNode args, String field) {
        JsonNode v = args.path(field);
        return v.isMissingNode() || v.isNull() ? "" : v.asText("").trim();
    }
}
