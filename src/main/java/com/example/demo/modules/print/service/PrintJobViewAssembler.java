package com.example.demo.modules.print.service;

import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.print.entity.PrintJob;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 打印任务的对外视图。
 *
 * 为什么要有这一层：任务里存的是 `created_by`（`STAFF_xxx` 这种认证 id），
 * 直接摆给前端就是一串没人看得懂的字符。全站的做法是**服务端按 id 批量解析出
 * 显示名**再返回（`UserDisplayNameService.resolveDisplayNames`），工位列表也是这么做的。
 * 前端拿到的应该永远是能给人看的东西。
 */
@Service
public class PrintJobViewAssembler {

    private final UserDisplayNameService displayNameService;

    public PrintJobViewAssembler(UserDisplayNameService displayNameService) {
        this.displayNameService = displayNameService;
    }

    public List<Map<String, Object>> toViews(List<PrintJob> jobs) {
        if (jobs == null || jobs.isEmpty()) return List.of();

        // 一次批量解析，别在循环里逐个查库
        List<String> ids = jobs.stream()
                .map(PrintJob::getCreatedBy)
                .filter(id -> id != null && !id.isBlank())
                .distinct()
                .toList();
        Map<String, String> names = ids.isEmpty()
                ? Map.of()
                : displayNameService.resolveDisplayNames(ids);

        return jobs.stream().map(j -> toView(j, names)).toList();
    }

    public Map<String, Object> toView(PrintJob j) {
        String uid = j.getCreatedBy();
        Map<String, String> names = uid == null || uid.isBlank()
                ? Map.of()
                : displayNameService.resolveDisplayNames(List.of(uid));
        return toView(j, names);
    }

    private static Map<String, Object> toView(PrintJob j, Map<String, String> names) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", j.getId());
        out.put("stationId", j.getStationId());
        out.put("sourceType", j.getSourceType());
        out.put("sourceId", j.getSourceId());
        out.put("fileName", j.getFileName());
        out.put("copies", j.getCopies());
        out.put("note", j.getNote());
        out.put("priority", j.getPriority());
        out.put("status", j.getStatus());
        out.put("attempts", j.getAttempts());
        out.put("lastError", j.getLastError());
        out.put("createdBy", j.getCreatedBy());
        // 解析不出来就退回 id —— 一个人的名字取不到不该让整条记录显示成空白
        out.put("createdByName", resolveName(j.getCreatedBy(), names));
        out.put("createdAt", j.getCreatedAt());
        out.put("sentAt", j.getSentAt());
        out.put("printedAt", j.getPrintedAt());
        return out;
    }

    private static String resolveName(String userId, Map<String, String> names) {
        if (userId == null || userId.isBlank()) return "";
        String n = names.get(userId);
        return n == null || n.isBlank() ? userId : n;
    }
}
