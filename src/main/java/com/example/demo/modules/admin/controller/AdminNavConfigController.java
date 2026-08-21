package com.example.demo.modules.admin.controller;

import com.example.demo.modules.admin.model.AdminNavConfigNode;
import com.example.demo.modules.admin.service.AdminNavConfigService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin-nav")
public class AdminNavConfigController {

    private final AdminNavConfigService service;

    public AdminNavConfigController(AdminNavConfigService service) {
        this.service = service;
    }

    @GetMapping("/config")
    public Map<String, Object> getConfig(@RequestParam(defaultValue = "ADMIN") String scope) {
        List<AdminNavConfigNode> tree = service.getFullTree(scope);
        return Map.of("success", true, "data", tree);
    }

    @PostMapping("/groups")
    public Map<String, Object> createGroup(@RequestBody Map<String, Object> body) {
        String parentId = (String) body.get("parentId");
        String type = (String) body.getOrDefault("type", "GROUP");
        String title = (String) body.get("title");
        String scope = (String) body.getOrDefault("scope", "ADMIN");
        int sortOrder = body.get("sortOrder") instanceof Number n ? n.intValue() : 0;
        AdminNavConfigNode node = service.createGroup(scope, parentId, type, title, sortOrder);
        return Map.of("success", true, "data", node);
    }

    @PutMapping("/groups/{id}/move")
    public Map<String, Object> moveGroup(@PathVariable String id, @RequestBody Map<String, Object> body) {
        String direction = (String) body.getOrDefault("direction", "");
        int delta = "up".equals(direction) ? -1 : "down".equals(direction) ? 1 : 0;
        if (delta == 0) {
            return Map.of("success", false, "message", "direction 须为 up 或 down");
        }
        AdminNavConfigNode node = service.moveGroupRelative(id, delta);
        return Map.of("success", true, "data", node);
    }

    @PutMapping("/groups/{id}")
    public Map<String, Object> updateGroup(@PathVariable String id, @RequestBody Map<String, Object> body) {
        String title = (String) body.get("title");
        Integer sortOrder = body.get("sortOrder") instanceof Number n ? n.intValue() : null;
        Boolean visible = body.get("visible") instanceof Boolean b ? b : null;
        AdminNavConfigNode node = service.updateGroup(id, title, sortOrder, visible);
        return Map.of("success", true, "data", node);
    }

    @DeleteMapping("/groups/{id}")
    public Map<String, Object> deleteGroup(@PathVariable String id) {
        service.deleteGroup(id);
        return Map.of("success", true);
    }

    @PutMapping("/items/{id}/move")
    public Map<String, Object> moveItem(@PathVariable String id, @RequestBody Map<String, Object> body) {
        String newParentId = (String) body.get("newParentId");
        service.moveItem(id, newParentId);
        return Map.of("success", true);
    }

    @PutMapping("/items/reorder")
    public Map<String, Object> reorderItems(@RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> orders = (List<Map<String, Object>>) body.get("orders");
        service.reorderItems(orders);
        return Map.of("success", true);
    }

    @PutMapping("/nodes/reorder")
    public Map<String, Object> reorderNodes(@RequestBody Map<String, Object> body) {
        String scope = (String) body.getOrDefault("scope", "ADMIN");
        String parentId = (String) body.get("parentId");
        @SuppressWarnings("unchecked")
        List<String> orderedIds = (List<String>) body.get("orderedIds");
        service.reorderNodes(scope, parentId, orderedIds);
        return Map.of("success", true);
    }

    @PostMapping("/ensure-items")
    public Map<String, Object> ensureItems(@RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) body.get("items");
        String scope = (String) body.getOrDefault("scope", "ADMIN");
        int created = 0;
        int existed = 0;
        for (Map<String, Object> item : items) {
            String path = (String) item.get("path");
            String label = (String) item.get("label");
            String icon = (String) item.getOrDefault("icon", "Layers");
            String groupTitle = (String) item.get("groupTitle");
            if (path == null || path.isBlank() || label == null || label.isBlank() || groupTitle == null) {
                continue;
            }
            Map<String, Object> r = service.ensureItem(scope, path, label, icon, groupTitle);
            if (Boolean.TRUE.equals(r.get("created"))) created++;
            else existed++;
        }
        return Map.of("success", true, "created", created, "existed", existed);
    }

    @PostMapping("/reset")
    public Map<String, Object> reset(@RequestBody(required = false) Map<String, Object> body) {
        String scope = body != null ? (String) body.getOrDefault("scope", "ADMIN") : "ADMIN";
        service.resetToDefault(scope);
        return Map.of("success", true, "message", "配置已清空，重启应用后将自动播种默认值");
    }
}
