# 房间–大华通道映射（修订版）

## 补充需求（导航 / 权限 / UI / 操作）

### 后台入口

- **映射配置**入口放在 **Admin 左侧导航栏**，与「通道编码」**同一权限区块**（`canViewMetaStorage`，即 `ADMIN` 及以上可见）。
- **位置**：建议紧挨「通道编码」上下（例如在「通道编码」下方），图标与文案风格与现有 side nav 一致（可参考 `Layers` 同级使用 `MapPin` / `Link2` 等 lucide 图标），避免散落在其它分组。

### 权限（与通道编码完全一致）

- **前端**：路由挂在 [`AdminGuard`](frontend/src/router/AdminGuard.tsx) 下，与 [`device-channels`](frontend/src/router/index.tsx) 同级；侧栏展示条件与 [`AdminLayout` 中「通道编码」](frontend/src/layouts/AdminLayout.tsx) 相同（`canViewMetaStorage` → `hasMinRole(role, "ADMIN")`）。
- **后端**：所有映射相关 API 使用与 [`DahuaMetaController`](src/main/java/com/example/demo/modules/dahua/controller/DahuaMetaController.java) 相同的 **`requireAdmin`**（`AuthContextService` + `RoleEnum.ADMIN`），与 `/api/v1/dahua/meta/device-channels` 权限模型一致。

### UI 优化（相对当前「通道编码」页的增强标准）

- **页头**：标题 + 一两行说明（数据来源、与发卡/扫码的关系），降低误操作。
- **工具栏**：
  - 关键词搜索、**应用查询**与「查询」按钮模式一致：输入框与 `appliedKeyword` 分离，避免每次 keystroke 打接口。
  - 可选维度：**区域 / 楼层 / 标签**（与库表字段对齐），布局紧凑、对齐 `AdminDeviceChannelPage` 的筛选区风格。
- **表格**：
  - 长字段（房间名、标签、多个通道编码）使用 **truncate + `title` 或 Tooltip**，避免撑破布局。
  - **通道编码**优先用 **标签（chip）列表**展示，多编码可换行展示，可读性优于纯逗号拼接。
  - 空状态、加载中状态明确（可与通道页「暂无数据」提示语风格统一）。
- **分页**：与通道编码页一致（上一页/下一页、当前页、总条数），避免仅前端切片大数据集。

### 操作逻辑优化

- **刷新 CSV**：
  - 点击后 **二次确认**（说明：按 `room_id` 合并、通道列存在时的**替换策略**），防止误触覆盖线上配置。
  - 接口返回 **导入统计**（如：房间 upsert 条数、通道写入条数、跳过/警告行），Toast 或页内简短结果区展示。
- **查询与刷新解耦**：刷新成功后 **自动 reload 当前页列表**，并保持当前筛选条件（或明确重置为第一页，二选一并在实现中固定一种行为）。
- **（推荐）单条维护**：除全量 CSV 刷新外，提供 **按房间维度的通道列表编辑**（抽屉或行内展开），减少「改一个门要改整表 CSV」的摩擦；保存走独立 API，与 CSV 刷新策略在文档中写清优先级（例如：DB 手改优先于下一次 CSV 同房间覆盖）。

## 与原方案一致的骨干（摘要）

- 表：`room_mapping_room`、`room_mapping_channel`；CSV 扩展列：`规则编号`、`标签`、`门禁通道编码`（分隔符约定统一）。
- `POST .../refresh-from-classpath`；`GET` 分页列表、`GET .../by-room-id/{roomId}`。
- classpath `room_mapping.csv` 保留为源文件，UTF-8 解析。

## 实施待办映射

| 事项 | 说明 |
|------|------|
| schema + 迁移 | 同原方案 |
| 后端 API | `requireAdmin`；刷新返回 stats |
| Admin 侧栏 + 路由 | `AdminLayout` + `router`，与通道编码同 Guard |
| 页面 UI | 页头、筛选、chip 展示通道、确认刷新、分页 |
| 操作逻辑 | 查询/应用分离、刷新确认与结果、可选抽屉编辑 |
