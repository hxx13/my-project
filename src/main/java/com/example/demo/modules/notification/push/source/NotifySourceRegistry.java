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

        // ==================== 类型 B：广播型（管理员在推送配置页指定接收人） ====================
        register("ACTIVATION_SUCCESS", "激活成功通知", "刷卡进入后刷激活门成功",
                Map.of("doorLabel", "门禁名称", "channelCode", "通道编码", "swingTime", "刷卡时间"));
        register("MATERIAL_REQUESTED", "物资申领-新申请", "学生提交物资申领后通知审核人",
                Map.of("applicantName", "申请人姓名", "applicantGroup", "课题组", "summary", "物品摘要", "bizId", "申请单号", "createdAt", "申请时间"));
        register("SCAN_DELAY_REQUESTED", "延迟免冻结-新申请", "学生提交延迟免冻结申请后通知审核人",
                Map.of("subjectName", "学生姓名", "subjectGroup", "课题组", "roomName", "房间名称", "optionLabel", "延迟选项", "requestId", "申请ID"));

        // ==================== 类型 A：个人型（后端查出 targetUserId 绑定的邮箱/微信推送） ====================
        register("SIGNOUT_COUNTDOWN", "签退倒计时通知", "进入后倒计时开始，通知被签退人",
                Map.of("targetUserId", "目标用户ID", "countdownSeconds", "倒计时秒数", "scheduledExitAt", "计划签退时间", "doorLabel", "门禁名称", "triggerReason", "触发原因"));
        register("MATERIAL_REVIEWED", "物资申领-审核结果", "审核通过/拒绝后通知申请人",
                Map.of("targetUserId", "目标用户ID", "applicantName", "申请人姓名", "auditResult", "审核结果(已通过/已拒绝)", "summary", "结果摘要", "bizId", "申请单号"));
        register("SCAN_DELAY_REVIEWED", "延迟免冻结-审核结果", "审核通过/拒绝后通知申请人",
                Map.of("targetUserId", "目标用户ID", "roomName", "房间名称", "optionLabel", "延迟选项", "auditResult", "审核结果", "rejectReason", "拒绝原因"));
        register("VIOLATION_CREATED", "违规记录通知", "违规记录创建后通知违规学生",
                Map.of("targetUserId", "目标用户ID", "title", "违规标题", "source", "违规来源(MANUAL/AUTO_STRANDED/CAGE_STATUS)", "summary", "违规摘要", "enterLocked", "是否禁入"));
        register("SCAN_DELAY_MANUAL", "手动免冻结通知", "管理员手动给予免冻结后通知学生",
                Map.of("targetUserId", "目标用户ID", "roomName", "房间名称", "optionLabel", "免冻结选项", "operatorName", "操作管理员"));

        log.info("[Push] 通知源注册完成（8个新源）");
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
