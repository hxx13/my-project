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
        register("PERSON_ENTER", "人员进入通知", "人员刷卡进入时触发",
                Map.of("personName", "人员姓名", "roomName", "房间名称", "enterTime", "进入时间", "doorName", "门禁名称"));
        register("PERSON_LEAVE", "人员离开通知", "人员刷卡离开时触发",
                Map.of("personName", "人员姓名", "roomName", "房间名称", "leaveTime", "离开时间", "doorName", "门禁名称"));
        register("STUDENT_AUDIT", "学生审核通知", "学生注册审核通过/拒绝",
                Map.of("studentName", "学生姓名", "auditResult", "审核结果", "auditTime", "审核时间", "remark", "备注"));
        register("DEVICE_ALARM", "设备告警通知", "温湿度/门禁异常",
                Map.of("deviceName", "设备名称", "alarmType", "告警类型", "alarmValue", "异常值", "alarmTime", "告警时间"));
        log.info("[Push] 通知源注册完成");
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
