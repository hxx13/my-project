package com.example.demo.modules.notification.push.source;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
@Order(2)
public class NotifySourceRegistry implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(NotifySourceRegistry.class);
    private final NotifySourceMapper sourceMapper;

    public NotifySourceRegistry(NotifySourceMapper sourceMapper) {
        this.sourceMapper = sourceMapper;
    }

    @Override
    public void run(ApplicationArguments args) {
        log.info("[Push] 注册通知源...");

        register("ACTIVATION_SUCCESS", "激活成功通知", "刷卡进入后刷激活门成功",
                Map.of("doorLabel", "门禁名称", "channelCode", "通道编码", "swingTime", "刷卡时间", "targetUserId", "刷卡人员ID（自动索引）"));
        register("SIGNOUT_COUNTDOWN", "签退倒计时通知", "进入后激活/出口倒计时开始",
                Map.of("countdownSeconds", "倒计时秒数", "scheduledExitAt", "计划签退时间", "doorLabel", "门禁名称", "triggerReason", "触发原因"));

        register("MATERIAL_REQUESTED", "物资申领-新申请", "学生提交物资申领",
                Map.of("applicantName", "申请人姓名", "applicantGroup", "课题组", "summary", "物品摘要", "bizId", "申请单号", "createdAt", "申请时间", "targetUserId", "申请人ID（自动索引）"));
        register("MATERIAL_REVIEWED", "物资申领-审核结果", "审核通过/拒绝",
                Map.of("applicantName", "申请人姓名", "auditResult", "审核结果", "summary", "结果摘要", "bizId", "申请单号"));

        register("SCAN_DELAY_REQUESTED", "延迟免冻结-新申请", "学生提交延迟免冻结申请",
                Map.of("subjectName", "学生姓名", "subjectGroup", "课题组", "roomName", "房间名称", "optionLabel", "延迟选项", "requestId", "申请ID", "targetUserId", "申请人ID（自动索引）"));
        register("SCAN_DELAY_REVIEWED", "延迟免冻结-审核结果", "审核通过/拒绝",
                Map.of("roomName", "房间名称", "optionLabel", "延迟选项", "auditResult", "审核结果", "rejectReason", "拒绝原因"));

        register("VIOLATION_CREATED", "违规记录通知", "违规记录创建",
                Map.of("title", "违规标题", "source", "违规来源", "summary", "违规摘要", "enterLocked", "是否禁入"));
        register("SCAN_DELAY_MANUAL", "手动免冻结通知", "管理员手动给予免冻结",
                Map.of("roomName", "房间名称", "optionLabel", "免冻结选项", "operatorName", "操作管理员", "targetUserId", "被授权学生ID（自动索引）"));

        // 采购
        register("PURCHASE_REQUESTED", "采购申请-新申请", "学生/教职工提交采购申请",
                Map.of("applicantName", "申请人姓名", "location", "采购地点", "content", "采购内容", "createdAt", "申请时间", "targetUserId", "申请人ID（仅回显，不推送）"));
        register("PURCHASE_COMPLETED", "采购申请-办结回执", "采购处理完毕通知提交人",
                Map.of("applicantName", "申请人姓名", "location", "采购地点", "summary", "处理摘要", "processorName", "处理人姓名", "targetUserId", "申请人ID（自动索引）"));

        // 报修
        register("REPAIR_REQUESTED", "报修申请-新申请", "学生/教职工提交报修申请",
                Map.of("applicantName", "申请人姓名", "location", "报修地点", "content", "报修内容", "createdAt", "申请时间", "targetUserId", "申请人ID（仅回显，不推送）"));
        register("REPAIR_COMPLETED", "报修申请-办结回执", "报修处理完毕通知提交人",
                Map.of("applicantName", "申请人姓名", "location", "报修地点", "summary", "处理摘要", "processorName", "处理人姓名", "targetUserId", "申请人ID（自动索引）"));

        // 物资领用
        register("SUPPLIES_REQUESTED", "物资领用-新申请", "教职工提交物资领用申请",
                Map.of("applicantName", "领用人姓名", "summary", "物品摘要", "createdAt", "申请时间", "targetUserId", "领用人ID（仅回显，不推送）"));
        register("SUPPLIES_COMPLETED", "物资领用-办结回执", "物资出库完毕通知领用人",
                Map.of("applicantName", "领用人姓名", "summary", "出库摘要", "targetUserId", "领用人ID（自动索引）"));

        // 聚合通知测试专用源
        register("DIGEST_TEST", "聚合通知测试", "仅用于聚合配置页面测试发送",
                Map.of("title", "标题", "content", "正文", "sourceName", "来源名称"));

        // ========== 动物房环境遥测 ==========
        register("TELEMETRY_ALARM", "动物房环境报警",
                "温湿度/压强超出阈值",
                Map.of("floorCode", "楼层编号", "roomName", "房间名称",
                        "metricKind", "指标类型（温度/湿度/压强）",
                        "alarmDirection", "报警方向（偏高/偏低）",
                        "currentValue", "当前读数", "limitValue", "报警阈值",
                        "sentAt", "报警时间"));
        register("TELEMETRY_RECOVERY", "动物房环境恢复",
                "越限指标恢复正常",
                Map.of("floorCode", "楼层编号", "roomName", "房间名称",
                        "metricKind", "指标类型", "currentValue", "当前读数",
                        "recoveryAt", "恢复时间"));

        register("SWIPE_FAILURE_ALERT", "刷卡失败告警",
                "同一通道在时间窗口内累计非法刷卡达到阈值时触发",
                Map.of("channelName", "通道名称", "personName", "人员姓名",
                        "deptName", "部门/课题组", "phone", "联系电话",
                        "count", "累计次数", "windowMin", "时间窗口（分钟）",
                        "threshold", "阈值次数", "openTypeLabel", "失败类型",
                        "swingTime", "刷卡时间"));

        log.info("[Push] 通知源注册完成（18个源）");
    }

    private void register(String code, String name, String desc, Map<String, String> variables) {
        NotifySource source = new NotifySource();
        source.setSourceCode(code);
        source.setSourceName(name);
        source.setDescription(desc);
        source.setVariables(toJson(variables));
        source.setEnabled(1);
        int rows = sourceMapper.insertOrIgnore(source);
        log.info("[Push] 注册通知源 {}: {}", rows > 0 ? "新增" : "已存在", code);
    }

    private String toJson(Map<String, String> map) {
        if (map == null || map.isEmpty()) return "{}";
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, String> e : map.entrySet()) {
            if (!first) sb.append(",");
            sb.append("\"").append(e.getKey()).append("\":\"")
                    .append(e.getValue().replace("\"", "\\\"")).append("\"");
            first = false;
        }
        sb.append("}");
        return sb.toString();
    }
}
