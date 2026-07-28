package com.example.demo.modules.notification.push.admin;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.notification.push.dispatch.PushService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;

@RestController
@RequestMapping("/api/admin/push-test")
public class AdminPushTestController {

    private final PushService pushService;

    public AdminPushTestController(PushService pushService) {
        this.pushService = pushService;
    }

    private Result<?> requireAdmin(HttpServletRequest request) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (!(attr instanceof User user)) return Result.error("未登录");
        if (user.getRole().getLevel() < RoleEnum.ADMIN.getLevel()) return Result.error("无权限访问");
        return null;
    }

    /** 列出所有可测试的消息源及其模拟数据 */
    @GetMapping("/sources")
    public Result<List<Map<String, Object>>> listSources(HttpServletRequest request) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) return Result.error(denied.getMessage());

        List<Map<String, Object>> sources = new ArrayList<>();
        sources.add(source("ACTIVATION_SUCCESS", "激活成功通知",
                Map.of("doorLabel", "A区主门禁", "channelCode", "CH01", "swingTime", now())));
        sources.add(source("SIGNOUT_COUNTDOWN", "签退倒计时通知",
                Map.of("countdownSeconds", "120", "scheduledExitAt", nowPlus(120),
                        "doorLabel", "B区出口", "triggerReason", "EXIT_DELAY")));
        sources.add(source("MATERIAL_REQUESTED", "物资申领-新申请",
                Map.of("applicantName", "测试学生", "applicantGroup", "测试课题组",
                        "summary", "共 3 项物资", "bizId", "MR-TEST-001", "createdAt", now())));
        sources.add(source("MATERIAL_REVIEWED", "物资申领-审核结果",
                Map.of("applicantName", "测试学生", "auditResult", "已通过",
                        "summary", "已出库：测试物品A、测试物品B", "bizId", "MR-TEST-001")));
        sources.add(source("SCAN_DELAY_REQUESTED", "延迟免冻结-新申请",
                Map.of("subjectName", "测试学生", "subjectGroup", "测试课题组",
                        "roomName", "A203", "optionLabel", "延迟30分钟", "requestId", "999")));
        sources.add(source("SCAN_DELAY_REVIEWED", "延迟免冻结-审核结果",
                Map.of("roomName", "A203", "optionLabel", "延迟30分钟",
                        "auditResult", "已通过", "rejectReason", "")));
        sources.add(source("VIOLATION_CREATED", "违规记录通知",
                Map.of("title", "违规提醒", "source", "MANUAL",
                        "summary", "测试违规记录——请分笼/密度超标", "enterLocked", "false")));
        sources.add(source("SCAN_DELAY_MANUAL", "手动免冻结通知",
                Map.of("roomName", "A203", "optionLabel", "手动免冻结", "operatorName", "测试管理员")));
        sources.add(source("TELEMETRY_ALARM", "动物房环境报警",
                Map.of("floorCode", "1F", "roomName", "201",
                        "metricKind", "温度", "alarmDirection", "偏高",
                        "currentValue", "28.5℃", "limitValue", "26.0℃",
                        "sentAt", now())));
        sources.add(source("TELEMETRY_RECOVERY", "动物房环境恢复",
                Map.of("floorCode", "1F", "roomName", "201",
                        "metricKind", "温度", "currentValue", "24.0℃",
                        "recoveryAt", now())));
        sources.add(source("SWIPE_FAILURE_ALERT", "刷卡失败告警",
                Map.of("channelName", "A区主门禁", "personName", "测试学生",
                        "deptName", "测试课题组", "phone", "13800138000",
                        "count", "5", "windowMin", "5",
                        "threshold", "3", "openTypeLabel", "非法刷卡开门",
                        "swingTime", now())));
        return Result.success(sources);
    }

    /** 发送测试推送 */
    @PostMapping("/send")
    public Result<Map<String, Object>> sendTest(@RequestBody Map<String, Object> body,
                                                 HttpServletRequest request) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) return Result.error(denied.getMessage());

        String sourceCode = body.get("sourceCode") instanceof String s ? s : null;
        if (sourceCode == null || sourceCode.isBlank()) {
            return Result.error("sourceCode 不能为空");
        }

        Map<String, String> vars = resolveSimData(sourceCode);
        if (vars == null) {
            return Result.error("未知的消息源: " + sourceCode + "，请先 GET /sources 查看可用列表");
        }

        // 允许调用方覆盖模拟数据中的字段
        body.forEach((k, v) -> {
            if (!"sourceCode".equals(k) && !"targetUserIds".equals(k) && v instanceof String sv) {
                vars.put(k, sv);
            }
        });

        // 提取指定的测试接收人
        @SuppressWarnings("unchecked")
        List<String> targetUserIdsRaw = body.get("targetUserIds") instanceof List<?> list ? (List<String>) list : null;
        Set<String> targetUserIds = targetUserIdsRaw != null && !targetUserIdsRaw.isEmpty()
                ? new LinkedHashSet<>(targetUserIdsRaw) : null;

        Map<String, Object> report = pushService.send(sourceCode, vars, targetUserIds);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("sourceCode", sourceCode);
        out.put("variables", vars);
        out.putAll(report);  // sent, failed, skipped, diagnosis
        return Result.success(out);
    }

    private Map<String, String> resolveSimData(String code) {
        return switch (code) {
            case "ACTIVATION_SUCCESS" -> new LinkedHashMap<>(Map.of("doorLabel","A区主门禁","channelCode","CH01","swingTime",now()));
            case "SIGNOUT_COUNTDOWN" -> new LinkedHashMap<>(Map.of("countdownSeconds","120","scheduledExitAt",nowPlus(120),"doorLabel","B区出口","triggerReason","EXIT_DELAY"));
            case "MATERIAL_REQUESTED" -> new LinkedHashMap<>(Map.of("applicantName","测试学生","applicantGroup","测试课题组","summary","共 3 项物资","bizId","MR-TEST-001","createdAt",now()));
            case "MATERIAL_REVIEWED" -> new LinkedHashMap<>(Map.of("applicantName","测试学生","auditResult","已通过","summary","已出库：测试物品A、测试物品B","bizId","MR-TEST-001"));
            case "SCAN_DELAY_REQUESTED" -> new LinkedHashMap<>(Map.of("subjectName","测试学生","subjectGroup","测试课题组","roomName","A203","optionLabel","延迟30分钟","requestId","999"));
            case "SCAN_DELAY_REVIEWED" -> new LinkedHashMap<>(Map.of("roomName","A203","optionLabel","延迟30分钟","auditResult","已通过","rejectReason",""));
            case "VIOLATION_CREATED" -> new LinkedHashMap<>(Map.of("title","违规提醒","source","MANUAL","summary","测试违规——请分笼/密度超标","enterLocked","false"));
            case "SCAN_DELAY_MANUAL" -> new LinkedHashMap<>(Map.of("roomName","A203","optionLabel","手动免冻结","operatorName","测试管理员"));
            case "PURCHASE_REQUESTED" -> new LinkedHashMap<>(Map.of("applicantName","测试用户","location","实验室A","content","试剂耗材一批","bizId","PO-TEST","createdAt",now()));
            case "PURCHASE_COMPLETED" -> new LinkedHashMap<>(Map.of("applicantName","测试用户","location","实验室A","summary","已采购完成","bizId","PO-TEST","processorName","测试管理员"));
            case "REPAIR_REQUESTED" -> new LinkedHashMap<>(Map.of("applicantName","测试用户","location","机房B","content","空调故障维修","bizId","RO-TEST","createdAt",now()));
            case "REPAIR_COMPLETED" -> new LinkedHashMap<>(Map.of("applicantName","测试用户","location","机房B","summary","已修复","bizId","RO-TEST","processorName","测试管理员"));
            case "SUPPLIES_REQUESTED" -> new LinkedHashMap<>(Map.of("applicantName","测试用户","summary","共 3 项物资","bizId","SC-TEST","createdAt",now()));
            case "SUPPLIES_COMPLETED" -> new LinkedHashMap<>(Map.of("applicantName","测试用户","summary","已出库：A4纸、记号笔、手套","bizId","SC-TEST"));
            case "TELEMETRY_ALARM" -> new LinkedHashMap<>(Map.of("floorCode","1F","roomName","201","metricKind","温度","alarmDirection","偏高","currentValue","28.5℃","limitValue","26.0℃","sentAt",now()));
            case "TELEMETRY_RECOVERY" -> new LinkedHashMap<>(Map.of("floorCode","1F","roomName","201","metricKind","温度","currentValue","24.0℃","recoveryAt",now()));
            case "SWIPE_FAILURE_ALERT" -> new LinkedHashMap<>(Map.of("channelName","A区主门禁","personName","测试学生","deptName","测试课题组","phone","13800138000","count","5","windowMin","5","threshold","3","openTypeLabel","非法刷卡","enterOrExitLabel","进入","swingTime",now()));
            default -> null;
        };
    }

    private static String now() { return LocalDateTime.now().truncatedTo(java.time.temporal.ChronoUnit.SECONDS).toString(); }
    private static String nowPlus(int seconds) { return LocalDateTime.now().plusSeconds(seconds).truncatedTo(java.time.temporal.ChronoUnit.SECONDS).toString(); }

    private static Map<String, Object> source(String code, String name, Map<String, String> vars) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("sourceCode", code);
        m.put("sourceName", name);
        m.put("variables", vars);
        return m;
    }
}
