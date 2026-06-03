# 后台侧边栏加宽 & 文件夹可视化管理 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 侧边栏加宽至 288px + 新增全屏可视化管理页面，支持拖拽调整导航入口归属、新建/重命名/删除文件夹，配置服务端持久化。

**Architecture:** 新建 `admin_nav_config` 数据库表存导航配置树（GROUP/SUBGROUP/ITEM 三级），Spring Boot ApplicationRunner 自动建表并播种现有硬编码 registry。前端 buildAdminNavModel 优先从 API 读取服务端配置，回退到硬编码 registry，然后合并 localStorage 个人覆盖。

**Tech Stack:** React 18 + TypeScript + Tailwind CSS + Spring Boot + JdbcTemplate + PostgreSQL

---

## File Structure Map

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/layouts/AdminLayout.tsx` | Modify | w-64→w-72 + 底部齿轮按钮 + 管理页面路由感知 |
| `frontend/src/features/admin/buildAdminNavModel.ts` | Modify | 合并引擎：API配置 → 回退 registry → 本地覆盖 |
| `frontend/src/features/admin/adminNavRegistry.ts` | Modify | 新增 `getRegistryAsSeedData()` 导出函数 |
| `frontend/src/api/domains/adminNavConfig.api.ts` | Create | API 调用封装 |
| `frontend/src/features/admin/AdminNavManager.tsx` | Create | 管理页面主组件 |
| `frontend/src/features/admin/AdminNavManagerTree.tsx` | Create | 左侧文件夹树 |
| `frontend/src/features/admin/AdminNavManagerEditor.tsx` | Create | 右侧编辑面板 |
| `frontend/src/features/admin/AdminNavManagerCreateDialog.tsx` | Create | 新建文件夹弹窗 |
| `frontend/src/router/index.tsx` | Modify | 添加 `/admin/nav-manager` 路由 |
| `src/main/java/.../admin/config/AdminNavConfigSchemaMigrator.java` | Create | 建表 + 种子数据 |
| `src/main/java/.../admin/controller/AdminNavConfigController.java` | Create | REST API |
| `src/main/java/.../admin/model/AdminNavConfigNode.java` | Create | 响应 DTO |
| `src/main/java/.../admin/service/AdminNavConfigService.java` | Create | 业务逻辑 |

---

### Task 1: 侧边栏加宽 w-64 → w-72

**Files:**
- Modify: `frontend/src/layouts/AdminLayout.tsx:884`

- [ ] **Step 1: 修改侧边栏宽度 class**

将 `<aside>` 的展开态宽度从 `w-64` 改为 `w-72`：

```tsx
// 修改前 (line 884):
sidebarCollapsed ? "w-14 px-2 py-4" : "w-64 p-5"

// 修改后:
sidebarCollapsed ? "w-14 px-2 py-4" : "w-72 p-5"
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/layouts/AdminLayout.tsx
git commit -m "fix: widen admin sidebar from w-64 to w-72 (256→288px) for icon+badge breathing room"
```

---

### Task 2: 后端 — 数据库迁移器

**Files:**
- Create: `src/main/java/com/example/demo/modules/admin/config/AdminNavConfigSchemaMigrator.java`

- [ ] **Step 1: 创建 AdminNavConfigSchemaMigrator**

参考 `FacilityMaintenanceSchemaMigrator.java` 模式（`ApplicationRunner` + `@Order`）。新建文件：

```java
package com.example.demo.modules.admin.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@Order(120)
public class AdminNavConfigSchemaMigrator implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(AdminNavConfigSchemaMigrator.class);
    private final JdbcTemplate jdbcTemplate;

    public AdminNavConfigSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            createTable();
            seedIfEmpty();
            log.info("[admin-nav-config] 表结构已就绪，种子数据已检查");
        } catch (Exception e) {
            log.error("[admin-nav-config] 迁移失败: {}", e.getMessage());
        }
    }

    private void createTable() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS admin_nav_config (
                    id VARCHAR(64) PRIMARY KEY,
                    parent_id VARCHAR(64) NULL COMMENT '父节点ID，NULL=顶级分组',
                    type VARCHAR(16) NOT NULL COMMENT 'GROUP | SUBGROUP | ITEM',
                    title VARCHAR(128) NOT NULL COMMENT '显示名称',
                    item_path VARCHAR(256) NULL COMMENT 'ITEM类型：路由路径',
                    item_icon VARCHAR(64) NULL COMMENT 'ITEM类型：Lucide图标名',
                    item_badge_key VARCHAR(64) NULL COMMENT 'ITEM类型：PendingBadges字段key',
                    sort_order INT NOT NULL DEFAULT 0,
                    visible TINYINT NOT NULL DEFAULT 1,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    KEY idx_nav_parent (parent_id),
                    KEY idx_nav_sort (sort_order)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='后台侧边栏导航配置'
                """);
    }

    private void seedIfEmpty() {
        Integer cnt = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM admin_nav_config", Integer.class);
        if (cnt != null && cnt > 0) {
            log.info("[admin-nav-config] 已有 {} 条配置，跳过种子数据", cnt);
            return;
        }
        // 种子数据从 ADMIN_NAV_REGISTRY 前端硬编码镜像写入
        // 注意：此处写入与 adminNavRegistry.ts 保持同步的结构
        seedGroup(null, 0, "org-notify", "组织与通知");
        seedItem("org-notify", 0, "item-personnel", "/admin/personnel", "人员授权", "Users", null);
        seedItem("org-notify", 1, "item-content-hub", "/admin/content-hub", "小程序内容中心", "Megaphone", null);
        seedItem("org-notify", 2, "item-student-warnings", "/admin/student-violations", "警告与弹窗公告", "AlertTriangle", null);

        seedGroup(null, 1, "system-security", "系统与安全");
        seedItem("system-security", 0, "item-schedule", "/admin/schedule-manager", "定时管理", "CalendarClock", null);
        seedItem("system-security", 1, "item-settings", "/admin/settings", "系统设置", "Settings", null);
        seedItem("system-security", 2, "item-logging-console", "/admin/logging-console", "日志控制台", "Terminal", null);
        seedItem("system-security", 3, "item-external-comm", "/admin/external-comm-config", "外部通信配置", "Link2", null);
        seedItem("system-security", 4, "item-api-docs", "/admin/api-docs", "接口中心", "BookOpen", null);
        seedItem("system-security", 5, "item-page-perms", "/admin/page-permissions", "页面权限设置", "KeyRound", null);
        seedItem("system-security", 6, "item-login-branding", "/admin/login-branding", "登录页轮播图", "Images", null);
        seedItem("system-security", 7, "item-registration-invites", "/admin/registration-invites", "注册推荐码", "Ticket", null);

        seedGroup(null, 2, "access-meta-env", "门禁、元数据与环境");
        seedItem("access-meta-env", 0, "item-dahua-issue", "/admin/dahua-issue", "大华发卡", "CreditCard", null);
        seedItem("access-meta-env", 1, "item-door-control", "/admin/door-control", "门禁控制", "DoorOpen", null);
        seedItem("access-meta-env", 2, "item-access-rules", "/admin/access-rules", "门禁规则配置", "LockKeyhole", null);
        seedItem("access-meta-env", 3, "item-swing-tasks", "/admin/dahua-swing-tasks", "门禁数据工作台", "SlidersHorizontal", null);
        seedItem("access-meta-env", 4, "item-swing-rules", "/admin/dahua-swing-rules", "门禁联动规则", "ShieldAlert", null);
        seedItem("access-meta-env", 5, "item-auto-logs", "/admin/automation-logs", "自动化日志", "FileText", null);
        seedItem("access-meta-env", 6, "item-dept-storage", "/admin/department-storage", "部门落库", "GitBranch", null);
        seedItem("access-meta-env", 7, "item-telemetry-wl", "/admin/telemetry-watchlists", "WinCC 变量导入", "Table2", null);
        seedItem("access-meta-env", 8, "item-telemetry-arch", "/admin/telemetry-archive", "温湿度数据归档", "Archive", null);
        seedItem("access-meta-env", 9, "item-animal-tel", "/animal-room-telemetry", "动物房温湿度监测", "Thermometer", null);
        seedItem("access-meta-env", 10, "item-animal-cockpit", "/animal-room-cockpit", "动物房驾驶舱", "BarChart3", null);
        seedItem("access-meta-env", 11, "item-digital-twin-screen", "/digital-twin-screen", "数字孪生大屏", "Monitor", null);

        seedGroup(null, 3, "aro-room-link", "ARO 房间与联动");
        seedItem("aro-room-link", 0, "item-door-group", "/admin/door-group-storage", "门组落库", "Server", null);
        seedItem("aro-room-link", 1, "item-device-ch", "/admin/device-channels", "通道编码", "BarChart3", null);
        seedItem("aro-room-link", 2, "item-aro-rooms", "/admin/aro-rooms", "ARO房间", "MapPin", null);
        seedItem("aro-room-link", 3, "item-access-audit-source", "/admin/access-audit-source", "门禁审计数据源", "Database", null);
        seedItem("aro-room-link", 4, "item-access-fusion", "/admin/access-fusion", "门禁融合清洗", "GitMerge", null);
        seedItem("aro-room-link", 5, "item-access-clean-rule-profiles", "/admin/access-clean-rule-profiles", "清洗规则管理", "Filter", null);
        seedItem("aro-room-link", 6, "item-dahua-swing-stats-tasks", "/admin/dahua-swing-stats-tasks", "门禁统计日报", "BarChart3", null);

        seedGroup(null, 4, "asset-ops", "资产与运维");
        seedItem("asset-ops", 0, "item-asset-records", "/admin/asset-records", "资产入库记录", "ClipboardCheck", null);
        seedItem("asset-ops", 1, "item-asset-transfer-records", "/admin/asset-transfer-records", "资产转移记录", "ArrowLeftRight", null);
        seedItem("asset-ops", 2, "item-cage-shelves", "/admin/cage-shelves", "笼架管理", "LayoutGrid", null);
        seedItem("asset-ops", 3, "item-device-channels", "/admin/device-channels", "门禁设备通道", "DoorOpen", null);
        seedItem("asset-ops", 4, "item-facility-maintenance", "/admin/facility-maintenance", "设施维护", "Wrench", null);

        seedGroup(null, 5, "repair-supplies", "报修与物资领用");
        seedSubgroup("repair-supplies", 0, "sg-repair", "报修管理");
        seedItem("sg-repair", 0, "item-repair-request", "/admin/repair-request", "报修申请", "Ticket", "repairText");
        seedItem("sg-repair", 1, "item-repair-process", "/admin/repair-process", "报修处理", "CircleCheck", "processRepairText");
        seedSubgroup("repair-supplies", 1, "sg-purchase", "采购管理");
        seedItem("sg-purchase", 0, "item-purchase-request", "/admin/purchase-request", "采购申请", "ShoppingCart", "purchaseText");
        seedItem("sg-purchase", 1, "item-purchase-process", "/admin/purchase-process", "采购处理", "CircleCheck", "processPurchaseText");
        seedSubgroup("repair-supplies", 2, "sg-supplies", "物资领用");
        seedItem("sg-supplies", 0, "item-supplies", "/admin/supplies", "物资商城", "Package", "suppliesText");
        seedItem("sg-supplies", 1, "item-supplies-manage", "/admin/supplies/manage", "物资管理", "TableProperties", "processSuppliesText");
        seedItem("sg-supplies", 2, "item-supplies-process", "/admin/supplies/process", "领用处理", "CircleCheck", "processSuppliesText");

        seedGroup(null, 6, "analytics", "数据分析");
        seedItem("analytics", 0, "item-analytics", "/admin/analytics", "数据看板", "PieChart", null);
        seedItem("analytics", 1, "item-student-activity", "/admin/student-activity", "学生活动分析", "Activity", null);

        log.info("[admin-nav-config] 种子数据已写入");
    }

    private void seedGroup(String parentId, int sortOrder, String id, String title) {
        jdbcTemplate.update(
                "INSERT IGNORE INTO admin_nav_config (id, parent_id, type, title, sort_order) VALUES (?, ?, 'GROUP', ?, ?)",
                id, parentId, title, sortOrder);
    }

    private void seedSubgroup(String parentId, int sortOrder, String id, String title) {
        jdbcTemplate.update(
                "INSERT IGNORE INTO admin_nav_config (id, parent_id, type, title, sort_order) VALUES (?, ?, 'SUBGROUP', ?, ?)",
                id, parentId, title, sortOrder);
    }

    private void seedItem(String parentId, int sortOrder, String id, String path, String label, String icon, String badgeKey) {
        jdbcTemplate.update(
                "INSERT IGNORE INTO admin_nav_config (id, parent_id, type, title, item_path, item_icon, item_badge_key, sort_order) VALUES (?, ?, 'ITEM', ?, ?, ?, ?, ?)",
                id, parentId, label, path, icon, badgeKey, sortOrder);
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/java/com/example/demo/modules/admin/config/AdminNavConfigSchemaMigrator.java
git commit -m "feat: add admin_nav_config schema migrator with seed data"
```

---

### Task 3: 后端 — Service 层

**Files:**
- Create: `src/main/java/com/example/demo/modules/admin/service/AdminNavConfigService.java`
- Create: `src/main/java/com/example/demo/modules/admin/model/AdminNavConfigNode.java`

- [ ] **Step 1: 创建 DTO**

```java
// AdminNavConfigNode.java
package com.example.demo.modules.admin.model;

import java.util.ArrayList;
import java.util.List;

public class AdminNavConfigNode {
    private String id;
    private String parentId;
    private String type;    // GROUP | SUBGROUP | ITEM
    private String title;
    private String itemPath;
    private String itemIcon;
    private String itemBadgeKey;
    private int sortOrder;
    private boolean visible;
    private List<AdminNavConfigNode> children = new ArrayList<>();

    // getters and setters
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getParentId() { return parentId; }
    public void setParentId(String parentId) { this.parentId = parentId; }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getItemPath() { return itemPath; }
    public void setItemPath(String itemPath) { this.itemPath = itemPath; }
    public String getItemIcon() { return itemIcon; }
    public void setItemIcon(String itemIcon) { this.itemIcon = itemIcon; }
    public String getItemBadgeKey() { return itemBadgeKey; }
    public void setItemBadgeKey(String itemBadgeKey) { this.itemBadgeKey = itemBadgeKey; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
    public boolean isVisible() { return visible; }
    public void setVisible(boolean visible) { this.visible = visible; }
    public List<AdminNavConfigNode> getChildren() { return children; }
    public void setChildren(List<AdminNavConfigNode> children) { this.children = children; }
}
```

- [ ] **Step 2: 创建 Service**

```java
// AdminNavConfigService.java
package com.example.demo.modules.admin.service;

import com.example.demo.modules.admin.model.AdminNavConfigNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.*;

@Service
public class AdminNavConfigService {
    private static final Logger log = LoggerFactory.getLogger(AdminNavConfigService.class);
    private final JdbcTemplate jdbcTemplate;

    public AdminNavConfigService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<AdminNavConfigNode> getFullTree() {
        List<AdminNavConfigNode> all = jdbcTemplate.query(
                "SELECT id, parent_id, type, title, item_path, item_icon, item_badge_key, sort_order, visible FROM admin_nav_config ORDER BY sort_order",
                new NodeRowMapper());
        // 构建树：先建 id->node 映射
        Map<String, AdminNavConfigNode> map = new LinkedHashMap<>();
        for (AdminNavConfigNode n : all) {
            map.put(n.getId(), n);
        }
        List<AdminNavConfigNode> roots = new ArrayList<>();
        for (AdminNavConfigNode n : all) {
            if (n.getParentId() == null || n.getParentId().isEmpty()) {
                roots.add(n);
            } else {
                AdminNavConfigNode parent = map.get(n.getParentId());
                if (parent != null) {
                    parent.getChildren().add(n);
                } else {
                    roots.add(n); // 孤立节点挂在根
                }
            }
        }
        return roots;
    }

    @Transactional
    public AdminNavConfigNode createGroup(String parentId, String type, String title, int sortOrder) {
        String id = UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        jdbcTemplate.update(
                "INSERT INTO admin_nav_config (id, parent_id, type, title, sort_order) VALUES (?, ?, ?, ?, ?)",
                id, parentId, type, title, sortOrder);
        return getById(id);
    }

    @Transactional
    public AdminNavConfigNode updateGroup(String id, String title, Integer sortOrder, Boolean visible) {
        StringBuilder sql = new StringBuilder("UPDATE admin_nav_config SET ");
        List<Object> params = new ArrayList<>();
        if (title != null) { sql.append("title = ?, "); params.add(title); }
        if (sortOrder != null) { sql.append("sort_order = ?, "); params.add(sortOrder); }
        if (visible != null) { sql.append("visible = ?, "); params.add(visible ? 1 : 0); }
        sql.append("updated_at = NOW() WHERE id = ?");
        params.add(id);
        jdbcTemplate.update(sql.toString().replace(",  WHERE", " WHERE"), params.toArray());
        return getById(id);
    }

    @Transactional
    public void deleteGroup(String id) {
        // 级联删除子节点
        Set<String> toDelete = new HashSet<>();
        collectDescendantIds(id, toDelete);
        toDelete.add(id);
        for (String did : toDelete) {
            jdbcTemplate.update("DELETE FROM admin_nav_config WHERE id = ?", did);
        }
    }

    private void collectDescendantIds(String parentId, Set<String> out) {
        List<String> children = jdbcTemplate.queryForList(
                "SELECT id FROM admin_nav_config WHERE parent_id = ?", String.class, parentId);
        for (String cid : children) {
            out.add(cid);
            collectDescendantIds(cid, out);
        }
    }

    @Transactional
    public void moveItem(String itemId, String newParentId) {
        jdbcTemplate.update(
                "UPDATE admin_nav_config SET parent_id = ?, updated_at = NOW() WHERE id = ? AND type = 'ITEM'",
                newParentId, itemId);
    }

    @Transactional
    public void reorderItems(List<Map<String, Object>> orders) {
        for (Map<String, Object> o : orders) {
            jdbcTemplate.update(
                    "UPDATE admin_nav_config SET sort_order = ?, updated_at = NOW() WHERE id = ?",
                    o.get("sortOrder"), o.get("id"));
        }
    }

    @Transactional
    public void resetToDefault() {
        jdbcTemplate.update("DELETE FROM admin_nav_config");
        // 注意：由于 AdminNavConfigSchemaMigrator 只在启动时运行，
        // 这里清空后需要主动触发重新播种。
        // 简单方案：删除所有数据后，应用重启时会自动播种。
        log.info("[admin-nav-config] 配置已清空，重启后将自动播种默认值");
    }

    private AdminNavConfigNode getById(String id) {
        List<AdminNavConfigNode> list = jdbcTemplate.query(
                "SELECT id, parent_id, type, title, item_path, item_icon, item_badge_key, sort_order, visible FROM admin_nav_config WHERE id = ?",
                new NodeRowMapper(), id);
        return list.isEmpty() ? null : list.get(0);
    }

    private static class NodeRowMapper implements RowMapper<AdminNavConfigNode> {
        @Override
        public AdminNavConfigNode mapRow(ResultSet rs, int rowNum) throws SQLException {
            AdminNavConfigNode n = new AdminNavConfigNode();
            n.setId(rs.getString("id"));
            n.setParentId(rs.getString("parent_id"));
            n.setType(rs.getString("type"));
            n.setTitle(rs.getString("title"));
            n.setItemPath(rs.getString("item_path"));
            n.setItemIcon(rs.getString("item_icon"));
            n.setItemBadgeKey(rs.getString("item_badge_key"));
            n.setSortOrder(rs.getInt("sort_order"));
            n.setVisible(rs.getInt("visible") == 1);
            return n;
        }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/java/com/example/demo/modules/admin/model/AdminNavConfigNode.java src/main/java/com/example/demo/modules/admin/service/AdminNavConfigService.java
git commit -m "feat: add AdminNavConfigService with tree build, CRUD, move, reorder"
```

---

### Task 4: 后端 — Controller 层

**Files:**
- Create: `src/main/java/com/example/demo/modules/admin/controller/AdminNavConfigController.java`

- [ ] **Step 1: 创建 Controller**

```java
// AdminNavConfigController.java
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
    public Map<String, Object> getConfig() {
        List<AdminNavConfigNode> tree = service.getFullTree();
        return Map.of("success", true, "data", tree);
    }

    @PostMapping("/groups")
    public Map<String, Object> createGroup(@RequestBody Map<String, Object> body) {
        String parentId = (String) body.get("parentId");
        String type = (String) body.getOrDefault("type", "GROUP");
        String title = (String) body.get("title");
        int sortOrder = body.get("sortOrder") instanceof Number n ? n.intValue() : 0;
        AdminNavConfigNode node = service.createGroup(parentId, type, title, sortOrder);
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

    @PostMapping("/reset")
    public Map<String, Object> reset() {
        service.resetToDefault();
        return Map.of("success", true, "message", "配置已清空，重启应用后将自动播种默认值");
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/java/com/example/demo/modules/admin/controller/AdminNavConfigController.java
git commit -m "feat: add AdminNavConfigController REST API for nav config CRUD"
```

---

### Task 5: 前端 — API 客户端

**Files:**
- Create: `frontend/src/api/domains/adminNavConfig.api.ts`

- [ ] **Step 1: 创建 API 封装**

```typescript
// adminNavConfig.api.ts
import { authHttp } from "@/api/core/authHttp";

export interface AdminNavConfigNode {
  id: string;
  parentId: string | null;
  type: "GROUP" | "SUBGROUP" | "ITEM";
  title: string;
  itemPath?: string | null;
  itemIcon?: string | null;
  itemBadgeKey?: string | null;
  sortOrder: number;
  visible: boolean;
  children: AdminNavConfigNode[];
}

interface ApiResult<T> {
  success: boolean;
  data: T;
  message?: string;
}

export async function fetchAdminNavConfig(): Promise<AdminNavConfigNode[]> {
  try {
    const res = await authHttp.get<ApiResult<AdminNavConfigNode[]>>("/admin-nav/config");
    if (res.data?.success && Array.isArray(res.data.data)) {
      return res.data.data;
    }
    return [];
  } catch {
    return [];
  }
}

export async function createNavGroup(body: {
  parentId?: string | null;
  type?: "GROUP" | "SUBGROUP";
  title: string;
  sortOrder?: number;
}): Promise<AdminNavConfigNode | null> {
  const res = await authHttp.post<ApiResult<AdminNavConfigNode>>("/admin-nav/groups", body);
  return res.data?.success ? res.data.data : null;
}

export async function updateNavGroup(
  id: string,
  body: { title?: string; sortOrder?: number; visible?: boolean }
): Promise<AdminNavConfigNode | null> {
  const res = await authHttp.put<ApiResult<AdminNavConfigNode>>(`/admin-nav/groups/${id}`, body);
  return res.data?.success ? res.data.data : null;
}

export async function deleteNavGroup(id: string): Promise<boolean> {
  const res = await authHttp.delete<ApiResult<null>>(`/admin-nav/groups/${id}`);
  return res.data?.success ?? false;
}

export async function moveNavItem(itemId: string, newParentId: string): Promise<boolean> {
  const res = await authHttp.put<ApiResult<null>>(`/admin-nav/items/${itemId}/move`, { newParentId });
  return res.data?.success ?? false;
}

export async function reorderNavItems(orders: { id: string; sortOrder: number }[]): Promise<boolean> {
  const res = await authHttp.put<ApiResult<null>>("/admin-nav/items/reorder", { orders });
  return res.data?.success ?? false;
}

export async function resetNavConfig(): Promise<boolean> {
  const res = await authHttp.post<ApiResult<null>>("/admin-nav/reset");
  return res.data?.success ?? false;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/domains/adminNavConfig.api.ts
git commit -m "feat: add admin nav config API client"
```

---

### Task 6: 前端 — 合并引擎改造 (buildAdminNavModel)

**Files:**
- Modify: `frontend/src/features/admin/buildAdminNavModel.ts`

- [ ] **Step 1: 重构 buildAdminNavModel 为异步，支持服务端配置优先**

核心改动：将 `buildAdminNavModel` 改为 `async`，优先从 API 获取配置，回退到硬编码：

```typescript
// 在 buildAdminNavModel.ts 顶部新增 import:
import { fetchAdminNavConfig, type AdminNavConfigNode } from "@/api/domains/adminNavConfig.api";

// 新增：将服务端配置节点转为侧边栏模型
function serverNodeToSidebarItem(node: AdminNavConfigNode, pendingBadges: PendingBadges | null): AdminSidebarNavItem | null {
  if (node.type !== "ITEM") return null;
  // 动态查找 Lucide 图标 — 如果 itemIcon 是字符串，从 lucide-react 导入
  const icon = resolveIconByName(node.itemIcon);
  return {
    key: node.id,
    to: node.itemPath || "",
    label: node.title,
    icon,
    badgeText: badgeTextFromKey(pendingBadges, node.itemBadgeKey as keyof PendingBadges | undefined),
    iconWrapClass: sidebarIconWrapForNavId(node.id),
  };
}

// 新增：递归将服务端配置树转为 AdminSidebarNavGroup[]
function convertServerConfigToSidebarGroups(
  nodes: AdminNavConfigNode[],
  pendingBadges: PendingBadges | null,
  ctx: AdminNavContext
): AdminSidebarNavGroup[] {
  const groups: AdminSidebarNavGroup[] = [];
  for (const node of nodes) {
    if (node.type === "GROUP" && node.visible) {
      const items: AdminSidebarNavItem[] = [];
      const subgroups: AdminSidebarNavSubgroup[] = [];
      for (const child of node.children) {
        if (child.type === "ITEM" && child.visible) {
          const si = serverNodeToSidebarItem(child, pendingBadges);
          if (si) items.push(si);
        } else if (child.type === "SUBGROUP" && child.visible) {
          const sgItems: AdminSidebarNavItem[] = [];
          for (const sgChild of child.children) {
            if (sgChild.type === "ITEM" && sgChild.visible) {
              const si = serverNodeToSidebarItem(sgChild, pendingBadges);
              if (si) sgItems.push(si);
            }
          }
          if (sgItems.length) {
            subgroups.push({ id: child.id, title: child.title, items: sgItems });
          }
        }
      }
      if (items.length || subgroups.length) {
        groups.push({ id: node.id, title: node.title, items, subgroups: subgroups.length ? subgroups : undefined });
      }
    } else if (node.type === "ITEM" && node.visible) {
      // 直接挂在根下的 ITEM（边界情况）
    }
  }
  return groups;
}

// 新增：图片名 → LucideIcon 的映射
import * as LucideIcons from "lucide-react";

function resolveIconByName(name: string | null | undefined): LucideIcon {
  if (!name) return LucideIcons.FileText;
  const iconMap = LucideIcons as Record<string, LucideIcon>;
  return iconMap[name] || LucideIcons.FileText;
}

// 改造：buildAdminNavModel 改为 async
export async function buildAdminNavModel(ctx: AdminNavContext, pendingBadges: PendingBadges | null) {
  // 1. 尝试从 API 获取服务端配置
  const serverConfig = await fetchAdminNavConfig();

  let sidebarGroups: AdminSidebarNavGroup[];
  let homeSections: AdminHomeSection[];

  if (serverConfig.length > 0) {
    // 使用服务端配置
    sidebarGroups = convertServerConfigToSidebarGroups(serverConfig, pendingBadges, ctx);
    homeSections = serverConfig
      .filter((n) => n.type === "GROUP" && n.visible)
      .map((g) => ({
        title: g.title,
        entries: g.children
          .filter((c) => c.type === "ITEM" && c.visible)
          .map((c) => ({
            title: c.title,
            path: c.itemPath || "",
            minRole: "STAFF" as MinRole,
            icon: resolveIconByName(c.itemIcon),
            tone: "from-sky-500 to-blue-600",
            enabled: true,
          })),
      }))
      .filter((s) => s.entries.length > 0);
  } else {
    // 回退到硬编码 registry
    const fallback = buildLegacyModel(ctx, pendingBadges);
    sidebarGroups = fallback.sidebarGroups;
    homeSections = fallback.homeSections;
  }

  // ...保留 flatNavigableItems 构建逻辑不变
}

// 将原有同步逻辑抽取为 buildLegacyModel（原 buildAdminNavModel 的内容）
function buildLegacyModel(ctx: AdminNavContext, pendingBadges: PendingBadges | null) {
  // ...（原 buildAdminNavModel 的全部逻辑，去掉 async/fetch 部分）
}
```

**注**：此改造较大。实际实现时需要保持与现有类型和下游消费者的兼容性（AdminLayout、AdminCommandPalette 等都使用此函数）。建议保留原函数签名，新增 `buildAdminNavModelAsync` 作为异步版本，逐步迁移。

- [ ] **Step 2: 更新 AdminLayout 中调用方**

在 `AdminLayout.tsx` 中，`useEffect` 调用 `buildAdminNavModel` 处改为 await：

```tsx
// 修改前（约 line 200-230 附近）：
const model = buildAdminNavModel(navCtx, pendingBadges);

// 修改后：
const model = await buildAdminNavModel(navCtx, pendingBadges);
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/admin/buildAdminNavModel.ts frontend/src/layouts/AdminLayout.tsx
git commit -m "feat: async buildAdminNavModel with server config priority and registry fallback"
```

---

### Task 7: 前端 — 管理页面组件

**Files:**
- Create: `frontend/src/features/admin/AdminNavManager.tsx`
- Create: `frontend/src/features/admin/AdminNavManagerTree.tsx`
- Create: `frontend/src/features/admin/AdminNavManagerEditor.tsx`
- Create: `frontend/src/features/admin/AdminNavManagerCreateDialog.tsx`

- [ ] **Step 1: 创建 AdminNavManagerCreateDialog**

```tsx
// AdminNavManagerCreateDialog.tsx
import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentId: string | null; // null = 顶级分组
  parentTitle?: string;
  onCreate: (type: "GROUP" | "SUBGROUP", title: string, parentId: string | null) => void;
}

export function AdminNavManagerCreateDialog({ open, onOpenChange, parentId, parentTitle, onCreate }: Props) {
  const [type, setType] = useState<"GROUP" | "SUBGROUP">(parentId ? "SUBGROUP" : "GROUP");
  const [title, setTitle] = useState("");

  const handleCreate = () => {
    if (!title.trim()) return;
    onCreate(type, title.trim(), parentId);
    setTitle("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新建文件夹</DialogTitle>
          <DialogDescription>
            {parentId ? `在「${parentTitle}」下创建子文件夹` : "创建顶级分组"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <label className="text-sm font-medium mb-1 block">类型</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as "GROUP" | "SUBGROUP")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              disabled={!!parentId}
            >
              <option value="GROUP">顶级分组</option>
              <option value="SUBGROUP">子分组</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">名称</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="输入文件夹名称..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleCreate} disabled={!title.trim()}>创建</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: 创建 AdminNavManagerTree（左侧文件夹树）**

```tsx
// AdminNavManagerTree.tsx
import { useState } from "react";
import { ChevronDown, ChevronRight, Folder, FolderOpen, GripVertical, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminNavConfigNode } from "@/api/domains/adminNavConfig.api";

interface Props {
  tree: AdminNavConfigNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddClick: (parentId: string | null, parentTitle?: string) => void;
}

export function AdminNavManagerTree({ tree, selectedId, onSelect, onAddClick }: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <span className="font-semibold text-sm text-gray-700">📁 文件夹结构</span>
        <button
          onClick={() => onAddClick(null)}
          className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-3 w-3" /> 新建
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {tree.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            depth={0}
            selectedId={selectedId}
            onSelect={onSelect}
            onAddClick={onAddClick}
          />
        ))}
      </div>
    </div>
  );
}

function TreeNode({ node, depth, selectedId, onSelect, onAddClick }: {
  node: AdminNavConfigNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddClick: (parentId: string | null, parentTitle?: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth === 0);
  const hasChildren = node.children && node.children.length > 0;
  const isGroup = node.type === "GROUP" || node.type === "SUBGROUP";
  const isSelected = node.id === selectedId;

  return (
    <div>
      <div
        onClick={() => {
          if (isGroup) setExpanded(!expanded);
          onSelect(node.id);
        }}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer text-sm transition-colors group",
          isSelected
            ? "bg-blue-100 text-blue-800 border-l-[3px] border-blue-600"
            : "hover:bg-gray-100 text-gray-700 border-l-[3px] border-transparent",
          depth > 0 && "ml-3"
        )}
      >
        {isGroup && (
          expanded ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            : <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        )}
        {!isGroup && <GripVertical className="h-3.5 w-3.5 text-gray-300 shrink-0" />}
        <span className="flex-1 truncate">
          {isGroup
            ? (expanded ? <FolderOpen className="h-3.5 w-3.5 inline mr-1.5 text-amber-500" /> : <Folder className="h-3.5 w-3.5 inline mr-1.5 text-amber-500" />)
            : <span className="inline-block w-5 text-center mr-1.5">📄</span>
          }
          {node.title}
        </span>
        {isGroup && (
          <span className="text-xs text-gray-400">{node.children?.length ?? 0}项</span>
        )}
        {isGroup && (
          <button
            onClick={(e) => { e.stopPropagation(); onAddClick(node.id, node.title); }}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-200 transition-all"
            title="添加子项"
          >
            <Plus className="h-3 w-3 text-gray-500" />
          </button>
        )}
      </div>
      {isGroup && expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onAddClick={onAddClick}
            />
          ))}
          {node.children.every((c) => c.type === "ITEM") && (
            <div className="ml-6 mt-0.5 mb-1 mx-3 h-0.5 bg-gradient-to-r from-transparent via-blue-300 to-transparent rounded" />
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 创建 AdminNavManagerEditor（右侧编辑面板）**

```tsx
// AdminNavManagerEditor.tsx
import { useState, useEffect } from "react";
import { GripVertical, Trash2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  updateNavGroup,
  deleteNavGroup,
  moveNavItem,
  reorderNavItems,
  resetNavConfig,
  type AdminNavConfigNode,
} from "@/api/domains/adminNavConfig.api";

interface Props {
  node: AdminNavConfigNode | null;
  allNodes: AdminNavConfigNode[];
  onRefresh: () => void;
}

export function AdminNavManagerEditor({ node, allNodes, onRefresh }: Props) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (node) setTitle(node.title);
  }, [node?.id]);

  if (!node) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <p>选择一个文件夹或入口进行编辑</p>
      </div>
    );
  }

  const isGroup = node.type === "GROUP" || node.type === "SUBGROUP";

  const handleSaveTitle = async () => {
    if (!title.trim() || title === node.title) return;
    setSaving(true);
    await updateNavGroup(node.id, { title: title.trim() });
    setSaving(false);
    onRefresh();
  };

  const handleDelete = async () => {
    if (!confirm(`确定要删除「${node.title}」${isGroup ? "及其所有子内容？" : "？"}`)) return;
    await deleteNavGroup(node.id);
    onRefresh();
  };

  const handleMoveItem = async (itemId: string, newParentId: string) => {
    await moveNavItem(itemId, newParentId);
    onRefresh();
  };

  const handleRemoveItem = async (itemId: string) => {
    // 移到"未归类"的临时方式：更新 parent 为 null
    await moveNavItem(itemId, "");
    onRefresh();
  };

  const handleReset = async () => {
    if (!confirm("确定要重置为默认配置？这将清空所有自定义修改。")) return;
    await resetNavConfig();
    onRefresh();
  };

  // 获取可作为移动目标的文件夹列表
  const targetFolders = allNodes
    .filter((n) => n.type === "GROUP" || n.type === "SUBGROUP")
    .filter((n) => n.id !== node.id);

  const childItems = node.children?.filter((c) => c.type === "ITEM") ?? [];

  return (
    <div className="p-6 space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-gray-800">
          编辑：{node.title}
        </h3>
        <p className="text-sm text-gray-400">
          {node.type === "GROUP" ? "顶级分组" : node.type === "SUBGROUP" ? "子分组" : "入口"}
          {isGroup && ` · 包含 ${childItems.length} 个入口`}
        </p>
      </div>

      {/* 名称编辑 */}
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-1">文件夹名称</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <Button onClick={handleSaveTitle} disabled={saving || title === node.title} size="sm">
            保存
          </Button>
        </div>
      </div>

      {/* 排序 - 仅分组 */}
      {isGroup && (
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">排序位置</label>
          <div className="flex gap-2 items-center">
            <Button variant="outline" size="sm" disabled={node.sortOrder <= 0}
              onClick={async () => { await updateNavGroup(node.id, { sortOrder: node.sortOrder - 1 }); onRefresh(); }}>
              ↑ 上移
            </Button>
            <Button variant="outline" size="sm"
              onClick={async () => { await updateNavGroup(node.id, { sortOrder: node.sortOrder + 1 }); onRefresh(); }}>
              ↓ 下移
            </Button>
            <span className="text-xs text-gray-400">当前第 {node.sortOrder + 1} 位</span>
          </div>
        </div>
      )}

      <hr className="border-gray-200" />

      {/* 包含的入口 - 仅分组 */}
      {isGroup && (
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">
            包含的入口
            {childItems.length === 0 && <span className="text-amber-500 ml-2">（暂无入口）</span>}
          </label>
          <div className="border border-gray-200 rounded-md p-1 max-h-64 overflow-y-auto space-y-0.5">
            {childItems.map((item) => (
              <div key={item.id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded text-sm group">
                <GripVertical className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                <span>📄 {item.title}</span>
                <span className="flex-1 text-xs text-gray-400 truncate">{item.itemPath}</span>
                <select
                  className="text-xs border border-gray-200 rounded px-1 py-0.5 opacity-0 group-hover:opacity-100"
                  value={node.id}
                  onChange={(e) => { if (e.target.value !== node.id) handleMoveItem(item.id, e.target.value); }}
                >
                  <option value={node.id}>移动到...</option>
                  {targetFolders.map((f) => (
                    <option key={f.id} value={f.id}>{f.title}</option>
                  ))}
                </select>
                <button
                  onClick={() => handleRemoveItem(item.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-600"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            <div className="px-3 py-3 text-center text-xs text-gray-300 border border-dashed border-gray-200 rounded">
              拖拽入口到此区域...
            </div>
          </div>
        </div>
      )}

      {/* 危险操作 */}
      <hr className="border-gray-200" />
      <div className="flex gap-2">
        <Button variant="destructive" size="sm" onClick={handleDelete}>
          🗑 删除此文件夹
        </Button>
        <Button variant="outline" size="sm" onClick={handleReset}
          className="border-amber-300 text-amber-700 hover:bg-amber-50">
          🔄 重置为默认
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 创建 AdminNavManager（主组件）**

```tsx
// AdminNavManager.tsx
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AdminNavManagerTree } from "./AdminNavManagerTree";
import { AdminNavManagerEditor } from "./AdminNavManagerEditor";
import { AdminNavManagerCreateDialog } from "./AdminNavManagerCreateDialog";
import {
  fetchAdminNavConfig,
  createNavGroup,
  type AdminNavConfigNode,
} from "@/api/domains/adminNavConfig.api";

export default function AdminNavManager() {
  const navigate = useNavigate();
  const [tree, setTree] = useState<AdminNavConfigNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [createParentTitle, setCreateParentTitle] = useState<string | undefined>();

  const loadTree = useCallback(async () => {
    const data = await fetchAdminNavConfig();
    setTree(data);
    // 如果没有选中项，默认选第一个分组
    if (!selectedId && data.length > 0) {
      setSelectedId(data[0].id);
    }
  }, [selectedId]);

  useEffect(() => {
    loadTree();
  }, []);

  const selectedNode = findNodeById(tree, selectedId);

  const handleCreate = async (type: "GROUP" | "SUBGROUP", title: string, parentId: string | null) => {
    await createNavGroup({ parentId, type, title });
    await loadTree();
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-white">
      {/* 左侧栏 */}
      <div className="w-80 shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col">
        {/* 返回按钮 */}
        <div className="px-4 py-3 border-b border-gray-200">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            返回后台
          </button>
        </div>
        <AdminNavManagerTree
          tree={tree}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAddClick={(pid, ptitle) => {
            setCreateParentId(pid);
            setCreateParentTitle(ptitle);
            setCreateOpen(true);
          }}
        />
      </div>

      {/* 右侧编辑面板 */}
      <div className="flex-1 overflow-y-auto">
        <AdminNavManagerEditor
          node={selectedNode ?? null}
          allNodes={flattenTree(tree)}
          onRefresh={loadTree}
        />
      </div>

      <AdminNavManagerCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        parentId={createParentId}
        parentTitle={createParentTitle}
        onCreate={handleCreate}
      />
    </div>
  );
}

/** 在树中递归查找节点 */
function findNodeById(tree: AdminNavConfigNode[], id: string | null): AdminNavConfigNode | undefined {
  if (!id) return undefined;
  for (const node of tree) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

/** 扁平化树 */
function flattenTree(tree: AdminNavConfigNode[]): AdminNavConfigNode[] {
  const result: AdminNavConfigNode[] = [];
  const walk = (nodes: AdminNavConfigNode[]) => {
    for (const n of nodes) {
      result.push(n);
      if (n.children) walk(n.children);
    }
  };
  walk(tree);
  return result;
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/admin/AdminNavManager.tsx frontend/src/features/admin/AdminNavManagerTree.tsx frontend/src/features/admin/AdminNavManagerEditor.tsx frontend/src/features/admin/AdminNavManagerCreateDialog.tsx
git commit -m "feat: add admin nav manager page with tree, editor, and create dialog"
```

---

### Task 8: 路由 + 侧边栏齿轮按钮

**Files:**
- Modify: `frontend/src/router/index.tsx`
- Modify: `frontend/src/layouts/AdminLayout.tsx`

- [ ] **Step 1: 添加路由**

在 `router/index.tsx` 的 AdminLayout children 中添加：

```tsx
// 在 SuperAdminGuard 的 children 中添加（管理页面需要 super admin）:
{ path: "nav-manager", element: <AdminNavManager /> }

// 文件顶部添加 import:
import AdminNavManager from "@/features/admin/AdminNavManager";
```

- [ ] **Step 2: 侧边栏底部添加齿轮按钮**

在 `AdminLayout.tsx` 的 `renderSidebarChrome` 函数中，在"收起侧栏"按钮（约 line 830-846）之后、`</nav>` 之前，添加齿轮按钮：

```tsx
{/* 文件夹管理按钮 — 仅超级管理员可见 */}
{!sidebarCollapsed && hasMinRole(role, "SUPER_ADMIN") ? (
  <button
    type="button"
    onClick={() => {
      onAfterNav?.();
      navigate("/admin/nav-manager");
    }}
    title="管理侧边栏文件夹"
    className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-left text-xs text-neutral-400 transition-colors hover:border-white/15 hover:bg-white/[0.08] hover:text-neutral-200"
  >
    <Settings className="h-4 w-4 shrink-0" />
    <span>管理文件夹</span>
  </button>
) : null}
```

同时确认顶部已导入 `Settings` from `lucide-react`（当前 import 行中可能已包含，检查第 35 行附近）。

- [ ] **Step 3: 处理导航到管理页面时的侧边栏状态**

在 AdminLayout 中，当 `pathname === "/admin/nav-manager"` 时，不需要特殊处理（管理页面是全屏页面，有自己的返回按钮）。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/router/index.tsx frontend/src/layouts/AdminLayout.tsx
git commit -m "feat: add /admin/nav-manager route and sidebar gear button for super admin"
```

---

### Task 9: 验证 & 端到端测试

- [ ] **Step 1: 启动后端，确认建表成功**

```bash
# 查看启动日志
grep "admin-nav-config" logs/app.log
# 预期：表结构已就绪，种子数据已写入
```

- [ ] **Step 2: 测试 API**

```bash
# 获取配置树
curl http://localhost:8080/api/admin-nav/config | jq .

# 新建分组
curl -X POST http://localhost:8080/api/admin-nav/groups \
  -H "Content-Type: application/json" \
  -d '{"title":"测试分组","type":"GROUP"}'

# 重命名
curl -X PUT http://localhost:8080/api/admin-nav/groups/<id> \
  -H "Content-Type: application/json" \
  -d '{"title":"新名称"}'
```

- [ ] **Step 3: 前端验证**

1. 侧边栏宽度应为 288px（展开态）
2. 底部出现 ⚙️ 齿轮按钮（仅 super admin）
3. 点击齿轮 → 进入 `/admin/nav-manager` 管理页面
4. 左侧显示文件夹树，可点击展开/折叠
5. 右侧可编辑名称、上移/下移排序
6. 可新建分组/子分组
7. 可删除分组（确认弹窗）

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: final verification and cleanup"
```
