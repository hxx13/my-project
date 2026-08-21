package com.example.demo.modules.twin.common.support;

import com.example.demo.modules.twin.common.entity.TwinAutomationLog;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 将自动化日志 {@code detail} 统一转为结构化中文键值对格式。
 *
 * <p>输出示例：
 * <pre>
 *   当前状态：等待激活
 *   时间限制：120秒
 *   到期时间：14:05:00
 *   地点：正门[CH001]
 *   房间：A101
 *   登记方式：Web扫码
 *   当前状态：进入
 * </pre>
 *
 * <p>每行格式：{@code 标签：内容}，行间以 {@code \n} 分隔。
 * 无法识别的模板降级为旧版 humanize+compact 行为。
 */
public final class TwinAutomationLogDetailHumanizer {

    private static final Pattern CHANNEL = Pattern.compile("channel=([^,\\s|）)]+)");
    private static final Pattern ROOM_ID = Pattern.compile("roomId=([0-9]{6,32})");
    private static final Pattern OPERATOR = Pattern.compile("操作人=([^，]+)");
    /** 门禁临时解锁等 detail 中的「人员[personCode]」技术码 */
    private static final Pattern PERSON_BRACKET = Pattern.compile("人员\\[([^\\]]+)\\]");
    private static final Pattern ROOM_NAME_JSON = Pattern.compile("\"roomName\"\\s*:\\s*\"([^\"]+)\"");
    private static final Pattern SECONDS = Pattern.compile("(\\d+)\\s*秒");
    private static final Pattern DATETIME = Pattern.compile("(\\d{4}-\\d{2}-\\d{2}\\s*T?\\d{2}:\\d{2}:\\d{2})");
    private static final Pattern BRACKETED = Pattern.compile("[「]([^」]+)[」]");
    private static final Pattern BRACKETED_CH = Pattern.compile("[（(]([^）)]+)[）)]");

    private TwinAutomationLogDetailHumanizer() {}

    // ═══════════════════════════════════════════════════
    // 公共入口
    // ═══════════════════════════════════════════════════

    public static void applyDetailDisplayZh(List<TwinAutomationLog> rows,
                                            Map<String, String> channelNameByCode,
                                            Map<String, String> roomNameById) {
        applyDetailDisplayZh(rows, channelNameByCode, roomNameById, Map.of());
    }

    public static void applyDetailDisplayZh(List<TwinAutomationLog> rows,
                                            Map<String, String> channelNameByCode,
                                            Map<String, String> roomNameById,
                                            Map<String, String> operatorNameById) {
        if (rows == null || rows.isEmpty()) return;
        Map<String, String> ch = channelNameByCode != null ? channelNameByCode : Map.of();
        Map<String, String> rm = roomNameById != null ? roomNameById : Map.of();
        Map<String, String> op = operatorNameById != null ? operatorNameById : Map.of();
        for (TwinAutomationLog row : rows) {
            if (row == null || "face".equals(row.getLogSource())) continue;
            String raw = row.getDetail();
            if (raw == null || raw.isBlank()) {
                row.setDetailDisplayZh("");
                continue;
            }
            row.setDetailDisplayZh(replacePersonBrackets(toStructuredLines(raw, ch, rm, op), op));
        }
    }

    /** 从 detail 中提取 "操作人=xxx" 的操作人 ID（供批量解析成用户名后回填展示） */
    public static List<String> extractOperatorIds(String detail) {
        List<String> out = new ArrayList<>();
        if (detail == null || detail.isBlank()) return out;
        Matcher m = OPERATOR.matcher(detail);
        while (m.find()) {
            String id = m.group(1).trim();
            if (!id.isEmpty() && !id.equals("-") && !out.contains(id)) out.add(id);
        }
        return out;
    }

    /** 从 detail 中提取「人员[personCode]」（门禁临时解锁等，技术码保留在库内 userId/detail） */
    public static List<String> extractPersonBracketIds(String detail) {
        List<String> out = new ArrayList<>();
        if (detail == null || detail.isBlank()) return out;
        Matcher m = PERSON_BRACKET.matcher(detail);
        while (m.find()) {
            String id = m.group(1).trim();
            if (!id.isEmpty() && !out.contains(id)) out.add(id);
        }
        return out;
    }

    /** 展示层把「人员[技术码]」替换为「人员[展示名]」，不改库存 detail。 */
    public static String replacePersonBrackets(String text, Map<String, String> personNameById) {
        if (text == null || text.isBlank() || personNameById == null || personNameById.isEmpty()) {
            return text == null ? "" : text;
        }
        Matcher m = PERSON_BRACKET.matcher(text);
        StringBuffer sb = new StringBuffer();
        while (m.find()) {
            String id = m.group(1).trim();
            String name = personNameById.get(id);
            String label = (name != null && !name.isBlank() && !name.equals(id)) ? name : id;
            m.appendReplacement(sb, Matcher.quoteReplacement("人员[" + label + "]"));
        }
        m.appendTail(sb);
        return sb.toString();
    }

    public static List<String> extractChannelCodes(String detail) {
        List<String> out = new ArrayList<>();
        if (detail == null || detail.isBlank()) return out;
        Matcher m = CHANNEL.matcher(detail);
        while (m.find()) {
            String c = m.group(1).trim();
            if (!c.isEmpty() && !out.contains(c)) out.add(c);
        }
        return out;
    }

    public static List<String> extractRoomIds(String detail) {
        List<String> out = new ArrayList<>();
        if (detail == null || detail.isBlank()) return out;
        Matcher m = ROOM_ID.matcher(detail);
        while (m.find()) {
            String id = m.group(1).trim();
            if (!id.isEmpty() && !out.contains(id)) out.add(id);
        }
        return out;
    }

    // ═══════════════════════════════════════════════════
    // 结构化格式化
    // ═══════════════════════════════════════════════════

    private static String toStructuredLines(String raw, Map<String, String> chMap, Map<String, String> rmMap,
                                            Map<String, String> operatorNameById) {
        String d = raw;

        // ── 提取通用字段 ──
        String secs = extractSeconds(d);
        String chan = resolveChannel(d, chMap);
        String room = resolveRoom(d, rmMap);
        String expiry = extractExpiryTime(d);

        List<String> lines = new ArrayList<>();

        // ── 1. 扫码进出 / 登记 ──
        if (d.contains("登记成功") || d.contains("Web扫码进入") || d.contains("Web扫码离开")
                || d.contains("终端扫码进入") || d.contains("终端扫码离开")
                || d.contains("扫码进入") || d.contains("扫码离开")
                || d.contains("动作=")) {
            // 动作=进入/离开
            if (d.contains("动作=进入") || d.contains("进入")) lines.add("当前状态：进入");
            else if (d.contains("动作=离开") || d.contains("离开")) lines.add("当前状态：离开");
            else lines.add("当前状态：登记");
            // 登记方式（Web扫码=自助登记，远程预约为后期新增）
            String method = "";
            if (d.contains("Web扫码") || d.contains("Web")) method = "自助登记";
            else if (d.contains("终端扫码") || d.contains("终端")) method = "终端扫码";
            else if (d.contains("扫码")) method = "扫码";
            if (!method.isEmpty()) lines.add("登记方式：" + method);
            // 房间：优先取 "房间=" 字段映射名，其次取 roomId 查库名
            String r = extractKv(d, "房间=");
            if (!r.isEmpty() && !r.contains("未传") && !r.equals("null")) lines.add("房间：" + r);
            else if (!room.isEmpty()) lines.add("房间：" + room);
            // 人员
            String person = extractKv(d, "人员=");
            if (!person.isEmpty() && !person.contains("未知人员")) lines.add("人员：" + person);
            if (!chan.isEmpty()) lines.add("地点：" + chan);
            return join(lines);
        }

        // ── 自动签退（必须在计时器之前匹配，防止 "延时签退" 抢先） ──
        if (d.contains("ARO") || d.contains("离开登记") || d.contains("AUTO_SIGNOUT_EXEC")) {
            String head = d.contains(" | ") ? d.substring(0, d.indexOf(" | ")) : d;
            if (head.contains("已无待离开") || head.contains("ARO_ALREADY_CLEAR")) {
                lines.add("当前状态：官方已清（跳过签退）");
            } else if (head.contains("失败") || head.contains("查询失败") || head.contains("提交失败") || head.contains("解析房间")) {
                lines.add("当前状态：签退失败");
                String reason = extractFailReason(head);
                if (!reason.isEmpty()) lines.add("原因：" + reason);
            } else {
                lines.add("当前状态：签退成功");
            }
            if (!room.isEmpty()) lines.add("房间：" + room);
            String outcome = linkageOutcome(d);
            if (!outcome.isEmpty()) lines.add("后置联动：" + outcome);
            return join(lines);
        }

        // ── 2. 门禁联动计时器 ──
        if (d.contains("待激活计时") || d.contains("待激活超时") || d.contains("PENDING_ACTIVATION")) {
            if (d.contains("超时") || d.contains("到期") || d.contains("AUTO_LEAVE"))
                lines.add("当前状态：待激活超时");
            else
                lines.add("当前状态：待激活中");
            if (!secs.isEmpty()) lines.add("时间限制：" + secs);
            if (!expiry.isEmpty()) lines.add("到期时间：" + expiry);
            if (!chan.isEmpty() && !chan.contains("占个位")) lines.add("地点：" + chan);
            return join(lines);
        }

        if (d.contains("延时签退") || d.contains("EXIT_DELAY") || d.contains("RESWIPE")) {
            if (d.contains("到期") || d.contains("AUTO_LEAVE") || d.contains("DUE_"))
                lines.add("当前状态：进入倒计时签退");
            else if (d.contains("RESWIPE"))
                lines.add("当前状态：二次签退计时");
            else
                lines.add("当前状态：倒计时开始");
            if (!secs.isEmpty()) lines.add("时间限制：" + secs);
            if (!chan.isEmpty()) lines.add("地点：" + chan);
            if (!expiry.isEmpty()) lines.add("到期时间：" + expiry);
            return join(lines);
        }

        if (d.contains("激活成功") || d.contains("刷卡激活") || d.contains("ACTIVATION_CARD_SUCCESS")) {
            lines.add("当前状态：激活成功");
            if (!chan.isEmpty()) lines.add("地点：" + chan);
            return join(lines);
        }

        if (d.contains("已激活宽限到期") || d.contains("ACTIVATED_SLA")) {
            lines.add("当前状态：激活宽限到期");
            if (!secs.isEmpty()) lines.add("时间限制：" + secs);
            if (!expiry.isEmpty()) lines.add("到期时间：" + expiry);
            return join(lines);
        }

        // ── 4. 定时任务 ──
        if (d.contains("定时任务已启动") || d.contains("定时任务执行成功") || d.contains("定时任务执行失败")) {
            if (d.contains("已启动")) lines.add("当前状态：执行中");
            else if (d.contains("成功")) lines.add("当前状态：执行成功");
            else lines.add("当前状态：执行失败");
            String summary = extractTaskSummary(d);
            if (!summary.isEmpty()) lines.add("摘要：" + summary);
            return join(lines);
        }

        // ── 5. 豁免统一台账（exempt-ledger 新格式：明述全部字段，不做摘要压缩） ──
        if (d.startsWith("授予冻结豁免") || d.startsWith("收回冻结豁免")) {
            return renderExemptLedgerLines(d, operatorNameById);
        }

        if (d.contains("豁免") || d.contains("EXEMPT")) {
            if (d.contains("回收") || d.contains("收回") || d.contains("RESET")) lines.add("当前状态：豁免回收");
            else lines.add("当前状态：豁免操作");
            if (!room.isEmpty()) lines.add("房间：" + room);
            return join(lines);
        }

        if (d.contains("冻结") || d.contains("FREEZE") || d.contains("REAPER")) {
            lines.add("当前状态：冻结跑批");
            if (!room.isEmpty()) lines.add("房间：" + room);
            return join(lines);
        }

        // ── 门禁临时解锁（detail 仍含技术 personCode；展示名由外层 replacePersonBrackets 回填） ──
        if (d.contains("人员[") && (d.contains("解锁") || d.contains("冷却") || d.contains("常闭")
                || d.contains("恢复普通") || d.contains("刷卡失败"))) {
            if (d.contains("冷却")) lines.add("当前状态：冷却中跳过");
            else if (d.contains("常闭")) lines.add("当前状态：常闭模式跳过");
            else if (d.contains("恢复普通")) lines.add("当前状态：恢复普通模式");
            else if (d.contains("执行失败") || d.contains("执行常开失败")) lines.add("当前状态：解锁失败");
            else lines.add("当前状态：临时解锁");
            if (!chan.isEmpty()) lines.add("地点：" + chan);
            Matcher pm = PERSON_BRACKET.matcher(d);
            if (pm.find()) {
                String pid = pm.group(1).trim();
                String pname = operatorNameById.get(pid);
                lines.add("人员：" + (pname != null && !pname.isBlank() ? pname : pid));
            }
            return join(lines);
        }

        // ── 降级：旧版 humanize + compact ──
        return compactForUi(legacyHumanize(d, chMap, rmMap));
    }

    // ═══════════════════════════════════════════════════
    // 豁免统一台账（exempt-ledger）明述渲染
    // ═══════════════════════════════════════════════════

    /**
     * 渲染豁免统一台账详情：按写入顺序逐字段明述（姓名/卡号/模式/到期/房间/操作人/关联单号/操作端等），
     * 不做摘要压缩；带括号的补充说明（覆盖旧豁免、次数配额重置）与无键说明归入「说明」行。
     */
    private static String renderExemptLedgerLines(String d, Map<String, String> operatorNameById) {
        List<String> lines = new ArrayList<>();
        boolean grant = d.startsWith("授予冻结豁免");
        lines.add("当前状态：" + (grant ? "豁免授予" : "豁免收回"));
        int dot = d.indexOf('。');
        String body = dot >= 0 ? d.substring(dot + 1) : d;
        List<String> notes = new ArrayList<>();
        for (String token : body.split("，")) {
            String t = token.trim();
            if (t.isEmpty()) continue;
            int eq = t.indexOf('=');
            int paren = firstParenIndex(t);
            if (eq < 0 || (paren >= 0 && paren < eq)) {
                // 无键说明（如"次数耗尽自动收回"）或括号补充（如"覆盖旧豁免(原到期=…)"）
                notes.add(t);
                continue;
            }
            String key = t.substring(0, eq).trim();
            String val = t.substring(eq + 1).trim();
            if (val.isEmpty()) continue;
            switch (key) {
                case "姓名" -> { if (!val.equals("-")) lines.add("姓名：" + val); }
                case "卡号" -> lines.add("卡号：" + val);
                case "模式" -> { if (!val.equals("-")) lines.add("豁免模式：" + labelExemptMode(val)); }
                case "到期" -> { if (!val.equals("-")) lines.add("到期时间：" + val); }
                case "次数上限" -> lines.add("次数上限：" + val + " 次");
                case "房间" -> lines.add("房间：" + renderExemptRooms(val));
                case "原到期" -> { if (!val.equals("-")) lines.add("原到期时间：" + val); }
                case "原模式" -> { if (!val.equals("-")) lines.add("原豁免模式：" + labelExemptMode(val)); }
                case "操作人" -> {
                    String name = operatorNameById.get(val);
                    lines.add("操作人：" + (name != null && !name.isBlank() ? name : val));
                }
                case "关联单号" -> lines.add("关联单号：" + val);
                case "客户端" -> lines.add("操作端：" + labelClientHint(val));
                case "授予日", "授予时间", "延迟选项", "时长" -> lines.add(key + "：" + val);
                default -> lines.add(key + "：" + val);
            }
        }
        if (!notes.isEmpty()) lines.add("说明：" + String.join("；", notes));
        return join(lines);
    }

    private static int firstParenIndex(String t) {
        int a = t.indexOf('(');
        int b = t.indexOf('（');
        if (a < 0) return b;
        if (b < 0) return a;
        return Math.min(a, b);
    }

    private static String labelExemptMode(String mode) {
        return switch (mode.trim().toUpperCase(Locale.ROOT)) {
            case "TIME" -> "按时长";
            case "COUNT" -> "按次数";
            case "BOTH" -> "时长+次数";
            default -> mode;
        };
    }

    private static String labelClientHint(String client) {
        return switch (client.trim().toLowerCase(Locale.ROOT)) {
            case "web" -> "网页管理台";
            case "miniapp" -> "小程序";
            case "room-audit-web" -> "网页在馆稽查";
            case "room-audit-miniapp" -> "小程序在馆稽查";
            default -> client;
        };
    }

    /** 房间字段：JSON 形如 [{"roomId":"…","roomName":"401"}] → "401"；"-" → 不限 */
    private static String renderExemptRooms(String val) {
        if (val.equals("-") || val.equals("[]")) return "不限（全部授权房间）";
        List<String> names = new ArrayList<>();
        Matcher m = ROOM_NAME_JSON.matcher(val);
        while (m.find()) {
            String n = m.group(1).trim();
            if (!n.isEmpty() && !names.contains(n)) names.add(n);
        }
        return names.isEmpty() ? val : String.join("、", names);
    }

    // ═══════════════════════════════════════════════════
    // 提取器
    // ═══════════════════════════════════════════════════

    private static String extractSeconds(String d) {
        Matcher m = SECONDS.matcher(d);
        if (m.find()) return m.group(1) + "秒";
        return "";
    }

    private static String resolveChannel(String d, Map<String, String> chMap) {
        // "「正门」/CH001" → 正门[CH001]（排除日期时间格式的「」内容）
        Matcher bm = BRACKETED.matcher(d);
        while (bm.find()) {
            String label = bm.group(1);
            // 过滤明文日期时间 "2026-07-08 13:46:12"
            if (label.matches(".*\\d{4}-\\d{2}-\\d{2}.*")) continue;
            String chCode = "";
            Matcher cm = CHANNEL.matcher(d);
            if (cm.find()) chCode = cm.group(1).trim();
            if (chCode.isEmpty()) return label;
            return label + "[" + chCode + "]";
        }
        // "channel=CH001" → 通道名[CH001]
        Matcher cm = CHANNEL.matcher(d);
        if (cm.find()) {
            String code = cm.group(1).trim();
            String name = chMap.getOrDefault(code, "");
            if (!name.isEmpty() && !name.equals(code)) return name + "[" + code + "]";
            return code;
        }
        return "";
    }

    private static String resolveRoom(String d, Map<String, String> rmMap) {
        // "ARO 离开登记已完成（房间A）。" → 房间A
        Matcher bcm = BRACKETED_CH.matcher(d);
        while (bcm.find()) {
            String cand = bcm.group(1);
            if (!cand.contains("秒") && !cand.contains("channel") && !cand.contains("autoRisk")
                    && !cand.equals("撤销下发") && !cand.equals("映射卡置为冻结") && cand.length() < 30)
                return cand;
        }
        // "roomId=123456" → 查库得房间名
        Matcher rm = ROOM_ID.matcher(d);
        if (rm.find()) {
            String id = rm.group(1).trim();
            String name = rmMap.getOrDefault(id, "");
            return name.isEmpty() ? id : name + "[" + id + "]";
        }
        return "";
    }

    private static String extractExpiryTime(String d) {
        Matcher m = DATETIME.matcher(d);
        if (m.find()) {
            String t = m.group(1).replace("T", " ");
            return t.length() >= 19 ? t.substring(11, 19) : t;
        }
        // "计划时刻：2026-07-08 14:05:00"
        int i = d.indexOf("计划时刻：");
        if (i >= 0) {
            String sub = d.substring(i + 5).trim();
            if (sub.length() >= 19) return sub.substring(0, 19).replace("T", " ");
            return sub.length() > 16 ? sub.substring(0, 16) : sub;
        }
        return "";
    }

    private static String extractFailReason(String d) {
        if (d.contains("用户ID为空")) return "用户ID为空";
        if (d.contains("查询失败") || d.contains("网络或上游异常")) return "ARO接口查询失败";
        if (d.contains("解析房间")) return "无法解析房间号";
        if (d.contains("提交离开登记失败") || d.contains("提交失败")) return "ARO提交签退被拒";
        return "";
    }

    /** 提取 "key=value" 中的 value（以 "，" "；" "|" 结束） */
    private static String extractKv(String d, String key) {
        int i = d.indexOf(key);
        if (i < 0) return "";
        i += key.length();
        int end = d.length();
        for (String sep : new String[]{"，", "；", "|", ",", ";"}) {
            int j = d.indexOf(sep, i);
            if (j > i && j < end) end = j;
        }
        String v = d.substring(i, end).trim();
        return v.equals("（房间名未传）") || v.equals("未知人员") || v.equals("null") ? "" : v;
    }

    /** 从 signout 详情尾部解析后置联动真实结果 */
    private static String linkageOutcome(String d) {
        String tail = d.contains(" | ") ? d.substring(d.lastIndexOf(" | ") + 1) : "";
        if (tail.isBlank()) return "";

        boolean revokeOff = tail.contains("未自动删除") || tail.contains("未调用大华") || tail.contains("为关闭");
        boolean revokeOn  = tail.contains("已自动删除") || tail.contains("撤销下发");
        boolean freezeOff = tail.contains("未自动冻结") || tail.contains("未执行冻结") || tail.contains("已关闭离开冻结");
        boolean freezeOn  = tail.contains("已自动冻结") || tail.contains("映射卡置为冻结");
        boolean exempt    = tail.contains("免冻结豁免");
        boolean noCard    = tail.contains("未找到孪生卡");

        List<String> parts = new ArrayList<>();
        if (revokeOn) parts.add("已回收门禁权限");
        else if (revokeOff) parts.add("门禁回收已关闭");

        if (freezeOn) parts.add("已冻结卡片");
        else if (freezeOff) parts.add("冻结已关闭");
        else if (exempt) parts.add("免冻结（未冻结）");
        else if (noCard) parts.add("无卡映射（未冻结）");

        return parts.isEmpty() ? "" : String.join("，", parts);
    }

    private static String extractTaskSummary(String d) {
        // "定时任务执行成功：同步156条，完成时间=..."
        int i = d.indexOf("：");
        if (i < 0) i = d.indexOf(": ");
        if (i >= 0) {
            String sub = d.substring(i + 1).trim();
            int end = sub.indexOf("，");
            if (end < 0) end = sub.indexOf("完成时间");
            if (end < 0) end = Math.min(sub.length(), 80);
            return sub.substring(0, end).trim();
        }
        return "";
    }

    // ═══════════════════════════════════════════════════
    // 旧版降级
    // ═══════════════════════════════════════════════════

    private static String legacyHumanize(String detail, Map<String, String> chMap, Map<String, String> rmMap) {
        String out = detail;
        out = out.replace("state=PENDING_ACTIVATION", "扫描通过，等待刷卡激活");
        out = out.replace("state=AUTO_EXIT_SCHEDULED", "等待自动签退");
        out = out.replace("state=ACTIVATED", "已激活");
        out = out.replace("state=IDLE", "空闲");
        out = out.replace("scheduledExitAt=", "计划时刻：");
        out = out.replace("autoRiskActionEnabled=关闭", "门禁联动已关闭");
        out = out.replace("autoRiskActionEnabled=打开", "门禁联动已开启");

        List<String> cKeys = new ArrayList<>(chMap.keySet());
        cKeys.sort(Comparator.comparingInt(String::length).reversed());
        for (String code : cKeys) {
            if (code == null || code.isBlank()) continue;
            String label = chMap.get(code);
            if (label == null || label.isBlank() || label.equals(code)) continue;
            out = out.replace("channel=" + code, "通道：" + label + "[" + code + "]");
        }

        List<String> rKeys = new ArrayList<>(rmMap.keySet());
        rKeys.sort(Comparator.comparingInt(String::length).reversed());
        for (String id : rKeys) {
            if (id == null || id.isBlank()) continue;
            String rn = rmMap.get(id);
            if (rn == null || rn.isBlank()) continue;
            out = out.replace("roomId=" + id, "房间：" + rn);
        }
        return out;
    }

    private static String compactForUi(String s) {
        if (s == null || s.isBlank()) return "";
        String out = s;
        out = out.replaceAll("（state=[A-Za-z0-9_]+）", "");
        out = out.replaceAll("（channel=[^）]+）", "");
        out = out.replaceAll("（编码[^）]*）", "");
        out = out.replaceAll("（roomId=[0-9]+）", "");
        out = out.replaceAll("\\s*\\|\\s*", "；");
        while (out.contains("；；")) out = out.replace("；；", "；");
        out = out.replace(";", "；");
        return out.trim();
    }

    public static Map<String, String> mergeBuiltinChannelLabels(Map<String, String> fromDb) {
        Map<String, String> m = new HashMap<>();
        if (fromDb != null) m.putAll(fromDb);
        m.putIfAbsent(TwinActivationLinkageLabels.PENDING_ACTIVATION_CHANNEL, "虚拟通道（等待激活）");
        return m;
    }

    // ═══════════════════════════════════════════════════
    // 工具
    // ═══════════════════════════════════════════════════

    private static String join(List<String> lines) {
        if (lines.isEmpty()) return "—";
        return String.join("\n", lines);
    }
}
