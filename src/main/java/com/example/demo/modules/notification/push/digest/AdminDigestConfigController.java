package com.example.demo.modules.notification.push.digest;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.notification.push.config.NotifySourceChannel;
import com.example.demo.modules.notification.push.config.NotifySourceChannelService;
import com.example.demo.modules.notification.push.dispatch.PushService;
import com.example.demo.modules.notification.push.source.NotifySource;
import com.example.demo.modules.notification.push.source.NotifySourceService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@RestController
@RequestMapping("/api/admin/digest-config")
public class AdminDigestConfigController {

    private final NotifyDigestDefaultConfigMapper defaultConfigMapper;
    private final PushService pushService;
    private final NotifySourceService sourceService;
    private final NotifySourceChannelService channelConfigService;
    private static final ObjectMapper objectMapper = new ObjectMapper();

    public AdminDigestConfigController(NotifyDigestDefaultConfigMapper defaultConfigMapper,
                                        PushService pushService,
                                        NotifySourceService sourceService,
                                        NotifySourceChannelService channelConfigService) {
        this.defaultConfigMapper = defaultConfigMapper;
        this.pushService = pushService;
        this.sourceService = sourceService;
        this.channelConfigService = channelConfigService;
    }

    private Result<?> requireSuperAdmin(HttpServletRequest request) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (!(attr instanceof User user)) return Result.error("当前登录信息无效");
        if (user.getRole().getLevel() < RoleEnum.SUPER_ADMIN.getLevel()) return Result.error("无权限访问");
        return null;
    }

    @GetMapping
    public Result<List<NotifyDigestDefaultConfig>> listAll(HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(defaultConfigMapper.findAll());
    }

    @PostMapping
    public Result<NotifyDigestDefaultConfig> create(@RequestBody NotifyDigestDefaultConfig config,
                                                     HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return Result.error(denied.getMessage());
        defaultConfigMapper.insert(config);
        return Result.success(config);
    }

    @PutMapping("/{id}")
    public Result<Void> update(@PathVariable Long id, @RequestBody NotifyDigestDefaultConfig config,
                                HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return Result.error(denied.getMessage());
        config.setId(id);
        defaultConfigMapper.update(config);
        return Result.success();
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return Result.error(denied.getMessage());
        defaultConfigMapper.delete(id);
        return Result.success();
    }

    @PostMapping("/test")
    public Result<Map<String, Object>> testDigest(@RequestBody Map<String, Object> body,
                                                   HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return Result.error(denied.getMessage());

        @SuppressWarnings("unchecked")
        List<String> sourceCodes = body.get("sourceCodes") instanceof List<?> list
                ? ((List<?>) list).stream().map(Object::toString).toList() : List.of();
        @SuppressWarnings("unchecked")
        List<String> targetUserIds = body.get("targetUserIds") instanceof List<?> tlist
                ? ((List<?>) tlist).stream().map(Object::toString).filter(s -> !s.isBlank()).toList() : List.of();
        String tplTitle = body.get("digestTitle") instanceof String s && !s.isBlank()
                ? s : "ARO 通知摘要 · {time}";
        String tplContent = body.get("digestContent") instanceof String s && !s.isBlank()
                ? s : "{userName}，您有 {count} 条新通知：\n\n{items}\n\n> ARO 系统自动推送";

        // 为每个信息源渲染其渠道模板内容
        StringBuilder items = new StringBuilder();
        DateTimeFormatter dtf = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
        for (String code : sourceCodes) {
            try {
                NotifySource src = sourceService.getByCode(code);
                List<NotifySourceChannel> channels = channelConfigService.listBySourceId(src.getId());
                NotifySourceChannel tpl = channels.stream()
                        .filter(c -> Boolean.TRUE.equals(c.getEnabled())).findFirst().orElse(null);

                // 解析变量及其 mock 值
                Map<String, String> vars = parseVariables(src.getVariables());
                Map<String, String> mockVars = buildMockVars(vars, src.getSourceName());

                // 用信息源自己的渠道模板渲染内容
                String itemContent = tpl != null ? render(tpl.getContentTpl(), mockVars)
                        : src.getSourceName() + " — 测试通知内容";

                items.append("【").append(src.getSourceName()).append("】\n");
                items.append("  · ").append(itemContent.replace("\n", "\n    ")).append("\n\n");
            } catch (Exception e) {
                items.append("【").append(code).append("】\n  测试通知项\n\n");
            }
        }

        String now = LocalDateTime.now().format(dtf);
        String title = tplTitle.replace("{time}", now).replace("{count}", String.valueOf(sourceCodes.size()));
        String content = tplContent
                .replace("{userName}", "管理员")
                .replace("{count}", String.valueOf(sourceCodes.size()))
                .replace("{time}", now)
                .replace("{items}", items.toString());

        Map<String, Object> report = targetUserIds.isEmpty()
                ? pushService.send("DIGEST_TEST", Map.of("title", title, "content", content, "sourceName", "聚合通知测试"))
                : pushService.send("DIGEST_TEST", Map.of("title", title, "content", content, "sourceName", "聚合通知测试"), new LinkedHashSet<>(targetUserIds));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("title", title);
        out.put("content", content);
        out.putAll(report);
        return Result.success(out);
    }

    /** 解析 variables JSON → Map */
    private Map<String, String> parseVariables(String json) {
        if (json == null || json.isBlank()) return Map.of();
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, String>>() {});
        } catch (Exception e) {
            return Map.of();
        }
    }

    /** 为变量生成 mock 值（中文，人类可读） */
    private Map<String, String> buildMockVars(Map<String, String> varDefs, String sourceName) {
        Map<String, String> m = new LinkedHashMap<>();
        for (String key : varDefs.keySet()) {
            m.put(key, mockValue(key, sourceName));
        }
        return m;
    }

    private String mockValue(String key, String sourceName) {
        return switch (key) {
            case "applicantName", "subjectName", "operatorName", "processorName" -> "张三";
            case "applicantGroup", "subjectGroup" -> "测试课题组";
            case "roomName", "location" -> "A203 实验室";
            case "doorLabel" -> "A区主门禁";
            case "channelCode" -> "CH01";
            case "swingTime", "createdAt", "scheduledExitAt" ->
                    LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));
            case "countdownSeconds" -> "120";
            case "summary" -> "测试物品A ×2、测试物品B ×1";
            case "content" -> "测试内容描述";
            case "optionLabel" -> "延迟30分钟";
            case "title" -> sourceName;
            case "auditResult" -> "已通过";
            case "rejectReason" -> "";
            case "triggerReason" -> "刷卡签退";
            case "source" -> "管理员记录";
            case "enterLocked" -> "未限制";
            case "bizId", "requestId", "targetUserId" -> "";
            default -> "—";
        };
    }

    /** 简单模板渲染 */
    private String render(String tpl, Map<String, String> vars) {
        if (tpl == null) return "";
        String result = tpl;
        for (var entry : vars.entrySet()) {
            result = result.replace("{" + entry.getKey() + "}", entry.getValue() != null ? entry.getValue() : "");
        }
        return result;
    }
}
