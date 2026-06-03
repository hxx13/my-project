# 后台侧边栏加宽 & 文件夹可视化管理

**Date**: 2026-06-03
**Status**: Approved
**Branch**: refactor/twin-package-split

## 概述

两个关联改进：
1. **侧边栏加宽**：256px (w-64) → 288px (w-72)，解决新增图标和气泡通知导致文字压缩的问题
2. **文件夹可视化管理**：全新的前端管理页面，支持自定义分组、移动入口归属、新建/删除文件夹

## 架构概览

```
┌───────────────────────┐     REST API      ┌──────────────────────────┐
│  admin_nav_config 表   │ ◄──────────────► │  管理页面 (AdminNavManager) │
│  (PostgreSQL)         │                   │  侧边栏 (AdminLayout)      │
└───────────────────────┘                   └──────────────────────────┘
                                                    │
                                           localStorage 个人覆盖
                                           (收藏/排序/隐藏项)
```

配置策略：**增量覆盖式** — 服务端存储默认配置（所有管理员共享），localStorage 存储个人覆盖增量（收藏、排序、隐藏）。渲染时合并两者。

## 1. 侧边栏宽度

- **文件**: `frontend/src/layouts/AdminLayout.tsx`
- **修改**: `<aside>` 的展开态 class 从 `w-64` 改为 `w-72`（256px → 288px）
- **折叠态**: 保持 `w-14`（56px）不变
- **其他联动**: 检查是否有依赖 `w-64` 或 `256px` 的 CSS 变量/计算，同步更新

## 2. 数据库设计

### admin_nav_config 表

```sql
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='后台侧边栏导航配置';
```

- 树形结构通过 `parent_id` 自引用表示
- GROUP: `parent_id=NULL`, `type='GROUP'`
- SUBGROUP: `parent_id=GROUP.id`, `type='SUBGROUP'`
- ITEM: `parent_id=GROUP.id或SUBGROUP.id`, `type='ITEM'`

### 种子数据

启动时从现有硬编码 `ADMIN_NAV_REGISTRY` 提取并写入。若表中已有数据则跳过。提供 `/api/admin-nav/reset` 接口可强制重置。

## 3. API 设计

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| `GET` | `/api/admin-nav/config` | 获取完整配置树（按 sort_order 排序） | 登录即可 |
| `POST` | `/api/admin-nav/groups` | 新建分组/子分组 | super_admin |
| `PUT` | `/api/admin-nav/groups/{id}` | 更新分组名称/排序/可见性 | super_admin |
| `DELETE` | `/api/admin-nav/groups/{id}` | 删除分组（级联删除子节点和入口配置，不删除实际页面） | super_admin |
| `PUT` | `/api/admin-nav/items/{id}/move` | 移动入口到另一个分组/子分组 | super_admin |
| `PUT` | `/api/admin-nav/items/reorder` | 批量更新排序（发送 `[{id, sort_order}]`） | super_admin |
| `POST` | `/api/admin-nav/reset` | 重置为硬编码默认值 | super_admin |

### GET /api/admin-nav/config 响应格式

```json
{
  "success": true,
  "data": [
    {
      "id": "group-asset-ops",
      "parentId": null,
      "type": "GROUP",
      "title": "资产与运维",
      "sortOrder": 0,
      "visible": true,
      "children": [
        {
          "id": "item-asset-record",
          "parentId": "group-asset-ops",
          "type": "ITEM",
          "title": "资产入库记录",
          "itemPath": "/admin/asset-record",
          "itemIcon": "clipboard-list",
          "itemBadgeKey": null,
          "sortOrder": 0,
          "visible": true
        }
      ]
    }
  ]
}
```

## 4. 前端组件架构

### 新增文件

| 文件 | 职责 |
|------|------|
| `frontend/src/api/domains/adminNavConfig.api.ts` | API 调用封装 |
| `frontend/src/features/admin/AdminNavManager.tsx` | 管理页面主组件（全屏布局） |
| `frontend/src/features/admin/AdminNavManagerTree.tsx` | 左侧文件夹树 + 拖拽 |
| `frontend/src/features/admin/AdminNavManagerEditor.tsx` | 右侧编辑面板 |
| `frontend/src/features/admin/AdminNavManagerCreateDialog.tsx` | 新建文件夹弹窗 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `frontend/src/layouts/AdminLayout.tsx` | w-64→w-72，底部添加齿轮按钮 |
| `frontend/src/features/admin/buildAdminNavModel.ts` | 合并引擎：优先服务端配置，回退硬编码，合并 localStorage 覆盖 |
| `frontend/src/router/index.tsx` | 添加 `/admin/nav-manager` 路由 |

### 后端新增

| 文件 | 职责 |
|------|------|
| `src/main/java/.../admin/config/AdminNavConfigSchemaMigrator.java` | ApplicationRunner：建表 + 种子数据 |
| `src/main/java/.../admin/controller/AdminNavConfigController.java` | REST 控制器 |
| `src/main/java/.../admin/service/AdminNavConfigService.java` | 业务逻辑 |

## 5. 合并引擎逻辑

修改 `buildAdminNavModel.ts`：

```
1. 尝试 GET /api/admin-nav/config
2. 若成功且有数据 → 使用服务端配置构建模型
3. 若失败或为空 → 回退到 ADMIN_NAV_REGISTRY 构建模型
4. 将步骤3的结果与 localStorage 个人覆盖合并：
   - 收藏列表（starredPaths）：注入"收藏"虚拟分组
   - 最近访问（recentPaths）：注入"常用"虚拟分组
   - 隐藏项（hiddenPaths）：从结果中移除
5. 注入"消息"虚拟分组（基于 PendingBadges）
6. 返回最终 AdminSidebarNavGroup[]
```

## 6. 个人覆盖 (localStorage)

当前已存在的 key（不变）：
- `aro-admin-sidebar-collapsed`: 折叠状态
- `aro-admin-starred-paths-v1`: 收藏路径列表
- `aro-admin-recent-paths-v1`: 最近访问路径列表
- `aro-admin-locked-page-v1`: 锁定页面路径
- `aroAdminSidebarOpenGroupsV1`: sessionStorage 中的展开分组

新增 key：
- `aro-admin-sidebar-hidden-paths-v1`: 用户隐藏的入口路径列表（个性化隐藏）
- `aro-admin-sidebar-item-order-v1`: 用户自定义的入口排序覆盖

## 7. 权限

- **查看配置**：所有登录用户（用于构建侧边栏）
- **编辑配置**：仅 `super_admin` 角色（管理页面入口仅对 super admin 可见）

## 8. 边界情况

- **删除分组**：级联删除子分组和入口配置记录（不影响实际页面和路由，只是移除侧边栏入口）
- **空分组**：无入口的分组在侧边栏中正常显示但内容为空；在管理页面中应提示"暂无入口"
- **配置为空**：首次启动或全部删除后，回退到硬编码 `ADMIN_NAV_REGISTRY`
- **API 不可用**：网络错误时回退到硬编码 + 本地覆盖，保证侧边栏始终可用
- **种子数据更新**：版本升级时若 registry 新增了入口，需在种子迁移中处理（INSERT IGNORE 新入口到默认分组）
- **个人覆盖冲突**：若用户把某入口同时收藏和隐藏，隐藏优先
