package com.example.demo.modules.twin.support;

import com.example.demo.modules.twin.entity.TwinAutomationDisplayMap;
import com.example.demo.modules.twin.entity.TwinAutomationLog;

import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 自动化日志展示用中文标签（与库存英文码并存，便于检索与对账）。
 */
public final class TwinAutomationLogDisplayHelper {

    public static final String MAP_AUTOMATION_TYPE = "AUTOMATION_TYPE";
    public static final String MAP_EVENT_KEY = "EVENT_KEY";
    public static final String MAP_TRIGGER_TYPE = "TRIGGER_TYPE";
    public static final String MAP_TRIGGER_REASON = "TRIGGER_REASON";

    private TwinAutomationLogDisplayHelper() {
    }

    private static String nz(String s) {
        return s == null ? "" : s.trim();
    }

    private static String mapOrRaw(Map<String, Map<String, String>> overrides, String type, String code, String raw) {
        String c = nz(code);
        if (c.isEmpty()) {
            return "-";
        }
        Map<String, String> bucket = overrides == null ? null : overrides.get(type);
        if (bucket != null) {
            String o = bucket.get(c);
            if (o != null && !o.isBlank()) {
                return o;
            }
        }
        return raw;
    }

    /**
     * 为单条日志填充 *_Label 展示字段；原始字段不修改。
     *
     * @param jobNames    {@link com.example.demo.modules.twin.service.JobExecutionRegistry#jobNameMap()} 返回值，可为 null
     * @param overrides   来自 twin_automation_display_map：外层 key 为 MAP_*，内层为 code_value -&gt; label_zh
     */
    public static void applyLabels(TwinAutomationLog row, Map<String, String> jobNames, Map<String, Map<String, String>> overrides) {
        if (row == null) {
            return;
        }
        Map<String, String> jobs = jobNames != null ? jobNames : Map.of();

        String at = nz(row.getAutomationType());
        row.setAutomationTypeLabel(mapOrRaw(overrides, MAP_AUTOMATION_TYPE, at, labelAutomationType(at)));

        String ek = nz(row.getEventKey());
        String eventDefault = jobs.getOrDefault(ek, labelEventKey(ek));
        row.setEventKeyLabel(mapOrRaw(overrides, MAP_EVENT_KEY, ek, eventDefault));

        String tt = nz(row.getTriggerType());
        row.setTriggerTypeLabel(mapOrRaw(overrides, MAP_TRIGGER_TYPE, tt, labelTriggerType(tt)));

        String tr = nz(row.getTriggerReason());
        row.setTriggerReasonLabel(mapOrRaw(overrides, MAP_TRIGGER_REASON, tr, labelTriggerReason(tr)));
    }

    public static Map<String, Map<String, String>> toOverrideBucketsFromEntities(List<TwinAutomationDisplayMap> rows) {
        Map<String, Map<String, String>> out = new HashMap<>();
        if (rows == null) {
            return out;
        }
        for (TwinAutomationDisplayMap r : rows) {
            if (r == null) {
                continue;
            }
            String type = nz(r.getCodeType());
            String code = nz(r.getCodeValue());
            String label = nz(r.getLabelZh());
            if (type.isEmpty() || code.isEmpty() || label.isEmpty()) {
                continue;
            }
            out.computeIfAbsent(type, k -> new HashMap<>()).put(code, label);
        }
        return out;
    }

    private static String labelAutomationType(String v) {
        if ("AUTO_SIGNOUT".equalsIgnoreCase(v)) {
            return "自动签退";
        }
        if ("ACCESS_TRACE".equalsIgnoreCase(v)) {
            return "通行与联动步骤";
        }
        if ("SCHEDULER".equalsIgnoreCase(v)) {
            return "定时任务";
        }
        if ("EXEMPTION".equalsIgnoreCase(v)) {
            return "豁免策略";
        }
        return v.isEmpty() ? "-" : v;
    }

    private static String labelTriggerType(String v) {
        return switch (v.toUpperCase(Locale.ROOT)) {
            case "TIMER" -> "定时触发";
            case "MANUAL" -> "手动触发";
            case "SYSTEM" -> "系统触发";
            default -> v.isEmpty() ? "-" : v;
        };
    }

    private static String labelTriggerReason(String v) {
        String u = v.toUpperCase(Locale.ROOT);
        return switch (u) {
            case "AUTO_SIGNOUT" -> "自动签退（规则触发）";
            case "FIRST_FREEZE_TIMER" -> "第一次冻结（按配置计划时刻）";
            case "SECOND_FREEZE_TIMER" -> "第二次冻结（按配置计划时刻）";
            case "SECOND_FREEZE_TIMER_DISABLED" -> "第二次冻结后自动离开（已关闭）";
            case "SECOND_FREEZE_STRANDED_TODAY_EXEMPT" -> "二次冻结：今日曾豁免且仍滞留";
            case "FIRST_FREEZE_FINISHED_CLEAR_ALL_EXEMPT" -> "首次冻结结束：清空当日豁免";
            case "DAILY_EXEMPT_RESET_TIMER" -> "每日豁免回收（凌晨定时）";
            case "BOOTSTRAP_CATCHUP" -> "启动补跑（错过窗的定时任务）";
            case "SCHEDULE_TICK" -> "定时调度心跳";
            case "MANUAL_RUN" -> "管理员手动执行";
            case "ACTIVATION_EXPIRE_AUTO_SIGNOUT" -> "待激活超时，自动签退";
            case "SWING_EXIT_DELAY_AUTO_SIGNOUT" -> "延时签退到期，自动签退";
            case "ACTIVATED_SLA_EXPIRE_AUTO_SIGNOUT" -> "已激活宽限到期，自动签退";
            case "LINKAGE_TIMER_ARO_ALREADY_CLEAR" -> "联动到期：官方无余房，已对齐";
            case "SWING_PENDING_ACTIVATION_TIMER_START" -> "待激活计时开始";
            case "SWING_ENTER_PENDING_ACTIVATION" -> "待激活计时开始（旧码）";
            case "SWING_ACTIVATION_CARD_SUCCESS" -> "激活成功";
            case "SWING_TOGGLE_ACTIVATED" -> "激活成功（旧码）";
            case "SWING_EXIT_DELAY_TIMER_STARTED" -> "已排程延时签退";
            case "SWING_ACTIVATED_RESWIPE_EXIT_TIMER_STARTED" -> "已排程延时签退（再刷门）";
            case "SWING_AUTO_LEAVE_DUE_PENDING_ACTIVATION" -> "待激活到期，将签退";
            case "SWING_AUTO_LEAVE_DUE_EXIT_DELAY" -> "延时签退到期，将签退";
            case "SWING_AUTO_LEAVE_DUE_ACTIVATED_SLA" -> "已激活宽限到期，将签退";
            case "SCAN_EXECUTE_ENTER" -> "Web/终端扫码：进入登记成功";
            case "SCAN_EXECUTE_EXIT" -> "Web/终端扫码：离开登记成功";
            case "REAPER_USER_FROZEN" -> "冻结跑批：单人已物理冻结";
            default -> v.isEmpty() ? "-" : v;
        };
    }

    private static String labelEventKey(String v) {
        String u = v.toUpperCase(Locale.ROOT);
        return switch (u) {
            case "AUTO_SIGNOUT_EXEC" -> "执行自动签退";
            case "LINKAGE_STEP" -> "联动步骤记录";
            case "RUN_REAPER" -> "首次冻结跑批";
            case "RUN_REAPER_SECOND" -> "第二次冻结跑批";
            case "REAPER_USER_FROZEN" -> "冻结跑批·单人";
            case "FIRST_FREEZE_CLEAR_EXEMPT" -> "清空豁免标记";
            case "SECOND_FREEZE_AUTO_SIGNOUT" -> "二次冻结后批量自动离开";
            case "DAILY_EXEMPT_RESET" -> "每日豁免重置";
            case "DAILY_EXEMPT_RESET_TIMER" -> "每日豁免重置（定时）";
            default -> v.isEmpty() ? "-" : v;
        };
    }
}
