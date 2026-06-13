# Smartsheet V2 — VTable替换 + 后端重构 设计方案

> 状态：设计完成 → 待用户审批
> 日期：2026-06-13
> 关联：[设计资源目录](design-catalog.md)

## 1. 背景与问题

### 现状

当前 `/#/admin/smartsheet` 页面使用 `@tanstack/react-table`（headless表格库）手搓完整电子表格应用。前端 18 个文件（~5000+行），实现了单元格编辑、格式化工具栏、撤销/重做、条件格式、查找替换、CSV导入导出、列配置等。后端 Spring Boot + MyBatis，JSON 列存储，3 张表。

### 核心问题

1. **造轮子**：`@tanstack/react-table` 是 headless 库，不具备电子表格能力。所有编辑、格式化、交互逻辑手写，工作量大且质量难达到产品级。
2. **后端混乱**：XLSX 导入是空壳（POI 已引入但逻辑未实现），变更日志粗粒度（全 JSON 快照），行数硬编码 500，DTO 冗余（6个），API 设计不支持单元格级更新。
3. **功能缺失**：无真正的 Excel/PDF 导出、无进度条/单选等单元格类型、模板系统薄弱、观赏性不足。

### 目标

- 前端用成熟的 VTable（VisActor/字节跳动 MIT 开源）替换手搓表格
- 后端清理重构，支持单元格级更新、真正导入导出、模板系统
- PM 检查表场景：复选框、下拉、单选、进度条、导出打印、数据联动

## 2. 技术选型

### 前端核心依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| `@visactor/vtable` | latest | 核心表格引擎（Canvas 渲染） |
| `@visactor/react-vtable` | latest | React 组件封装 |
| `@visactor/vtable-export` | latest | CSV/Excel/PDF 导出 |
| `@visactor/vtable-search` | latest | 搜索替换 |
| `@tanstack/react-query` | 5.x（保持） | 数据请求与缓存 |
| `react-hot-toast` | 保持 | 消息提示 |
| `lucide-react` | 保持 | 图标 |

移除的依赖：无需引入新的，`@tanstack/react-table` 是否保留取决于项目其他页面是否使用。

### 后端依赖

| 依赖 | 用途 |
|------|------|
| Apache POI 5.4.1 | XLSX 导入/导出（已引入，此前为空壳） |
| Jackson | JSON 序列化（保持） |
| MyBatis | 数据访问（保持） |

## 3. 架构设计

### 3.1 前端架构

```
src/features/smartsheet/
├── SmartSheetPage.tsx          ← VTable 容器页面（重写）
├── SmartSheetListPage.tsx      ← 列表页（改造，保留模板卡片）
├── components/
│   ├── SheetToolbar.tsx        ← 自定义工具栏（FormatBar + 操作按钮）
│   ├── SheetTemplateCard.tsx   ← 模板卡片（保留改造）
│   ├── ImportDialog.tsx        ← 导入对话框（保留改造）
│   └── ColumnConfigPanel.tsx   ← 列配置面板（保留改造）
├── hooks/
│   ├── useSmartSheetData.ts    ← 数据桥接 hook（API → VTable records）
│   └── useSmartSheetMutation.ts ← 变更提交 hook（cellEdit → API PATCH）
├── api/
│   └── smartsheet.api.ts       ← API 调用（改 endpoint）
├── vtable-config/
│   ├── columns.ts              ← 列定义生成器（后端 JSON → VTable columns）
│   ├── theme.ts                ← VTable 主题定制（匹配 --app-color-* 令牌）
│   └── editors.ts              ← 自定义编辑器（如需要）
└── types.ts                    ← TypeScript 类型（精简）
```

**从 18 文件 → 精简至 ~12 文件，核心表格代码量减少 80%。**

### 3.2 后端架构

```
modules/smartsheet/
├── controller/
│   └── SmartsheetController.java        ← 改造
├── service/
│   ├── SmartsheetService.java           ← 重构
│   ├── SmartsheetRowService.java        ← 重构（加单元格级更新）
│   ├── SmartsheetImportService.java     ← NEW：流式导入
│   └── SmartsheetExportService.java     ← NEW：多格式导出
├── mapper/
│   ├── SmartsheetDefinitionMapper.java  ← 改造
│   ├── SmartsheetRowMapper.java         ← 改造
│   └── SmartsheetChangeLogMapper.java   ← 改造
├── entity/
│   ├── SmartsheetDefinition.java        ← 加字段
│   ├── SmartsheetRow.java               ← 不变
│   └── SmartsheetChangeLog.java         ← 改 columnKey 含义
├── dto/
│   ├── SmartsheetSheetRequest.java      ← 合并 Create + Update
│   ├── SmartsheetCellUpdateRequest.java ← NEW：单元格更新
│   ├── SmartsheetDefinitionVO.java      ← 合并 Stats
│   └── SmartsheetImportResult.java      ← NEW：导入结果
├── enums/
│   ├── ColumnType.java                  ← NEW：列类型枚举
│   └── SmartsheetErrorCode.java         ← NEW：独立错误码
└── validator/
    └── ColumnValidator.java             ← NEW：策略模式校验
```

**DTO 6→4，Controller 瘦身，Service 职责分离。**

### 3.3 数据流

```
┌─────────────────────────────────────────────────┐
│                   React Frontend                  │
│                                                   │
│  useSmartSheetData(sheetId)                      │
│    ├── GET /sheet/{id}  → columns[] + records[]  │
│    └── 组装 VTable option: { columns, records }   │
│                                                   │
│  VTable ListTable                                 │
│    ├── 渲染（Canvas）                              │
│    ├── 内置：排序、筛选、列宽拖拽、右键菜单          │
│    ├── 内置：checkbox/radio/progressbar 渲染       │
│    └── 事件：onChangeCellValue                    │
│                                                   │
│  useSmartSheetMutation()                          │
│    └── PATCH /sheet/{id}/row/{rowId}/cell         │
│         body: { columnKey, value }                │
│                                                   │
│  导出：vtable-export 包（纯前端，不调后端）          │
│  导入：ImportDialog → POST /{id}/import            │
└─────────────────────────────────────────────────┘
                      ↕ HTTP JSON
┌─────────────────────────────────────────────────┐
│              Spring Boot Backend                  │
│                                                   │
│  Controller: REST 端点 + 权限校验                  │
│  Service: 业务逻辑 + 乐观锁 + 变更日志              │
│  Mapper: MyBatis 注解 SQL                        │
│  MySQL: 3 张表（JSON 列存储）                      │
└─────────────────────────────────────────────────┘
```

## 4. API 设计

### 4.1 Sheet CRUD

| Method | URL | 说明 |
|--------|-----|------|
| GET | `/api/admin/smartsheet/sheet/page?page=&pageSize=` | 分页列表（置顶优先） |
| POST | `/api/admin/smartsheet/sheet` | 创建 |
| GET | `/api/admin/smartsheet/sheet/{id}` | 详情 + columnsConfig |
| PUT | `/api/admin/smartsheet/sheet/{id}` | 更新 |
| DELETE | `/api/admin/smartsheet/sheet/{id}` | 删除（事务级联） |
| POST | `/api/admin/smartsheet/sheet/{id}/duplicate?withData=` | 复制 |
| POST | `/api/admin/smartsheet/sheet/{id}/pin` | 置顶切换 |

### 4.2 Row CRUD（重构）

| Method | URL | 说明 |
|--------|-----|------|
| GET | `/api/admin/smartsheet/{sheetId}/rows?page=&pageSize=` | 分页列表 |
| POST | `/api/admin/smartsheet/{sheetId}/row` | 添加行 |
| **PATCH** | `/api/admin/smartsheet/{sheetId}/row/{rowId}/cell` | **单元格更新（新）** |
| DELETE | `/api/admin/smartsheet/{sheetId}/row/{rowId}` | 删除行 |
| POST | `/api/admin/smartsheet/{sheetId}/rows/batch` | 批量添加 |

**PATCH 单元格更新 Body：**
```json
{
  "columnKey": "status",
  "value": "完成",
  "expectedVersion": 3
}
```
- `expectedVersion`：乐观锁版本号，不匹配则返回 409 Conflict
- 仅更新 `cellData` JSON 中的目标 key，不触碰其他列
- 自动写变更日志（oldValue / newValue / columnKey）

### 4.3 Import/Export（重做）

| Method | URL | 说明 |
|--------|-----|------|
| POST | `/api/admin/smartsheet/{sheetId}/import` | XLSX/CSV 流式导入 |
| GET | `/api/admin/smartsheet/{sheetId}/export/csv` | CSV 导出（UTF-8 BOM） |
| GET | `/api/admin/smartsheet/{sheetId}/export/xlsx` | XLSX 导出（POI，带样式） |
| GET | `/api/admin/smartsheet/{sheetId}/export/pdf` | PDF 导出（新） |

注：PDF 导出主要通过前端 `vtable-export` 完成。后端 `/export/pdf` 为服务端生成场景保留。

### 4.4 Template（新）

| Method | URL | 说明 |
|--------|-----|------|
| GET | `/api/admin/smartsheet/templates` | 模板列表 |
| POST | `/api/admin/smartsheet/template` | 保存为模板 |
| POST | `/api/admin/smartsheet/sheet/from-template/{templateId}` | 从模板创建 |

### 4.5 Statistics（保持）

| Method | URL | 说明 |
|--------|-----|------|
| GET | `/api/admin/smartsheet/{sheetId}/stats?columnKey=` | 列统计 |

## 5. 数据库设计

### 5.1 不变的表

三张核心表 `smartsheet_definition`、`smartsheet_row`、`smartsheet_change_log` 结构保持，仅做增量修改。

### 5.2 迁移 SQL

```sql
-- V{timestamp}__smartsheet_v2_enhance.sql

-- smartsheet_definition 加字段
ALTER TABLE smartsheet_definition
  ADD COLUMN row_limit INT DEFAULT 50000 COMMENT '行数上限',
  ADD COLUMN theme_config JSON COMMENT 'VTable 主题配置',
  ADD COLUMN is_template TINYINT DEFAULT 0 COMMENT '是否模板';

-- smartsheet_row 加索引
CREATE INDEX idx_sheet_row_index ON smartsheet_row(sheet_id, row_index);

-- smartsheet_change_log 优化
ALTER TABLE smartsheet_change_log
  ADD COLUMN row_index INT COMMENT '行位置快照',
  MODIFY COLUMN column_key VARCHAR(64) NOT NULL COMMENT '具体列名（不再是*）';
```

### 5.3 列类型枚举

```java
public enum ColumnType {
    TEXT("text"),
    NUMBER("number"),
    SELECT("select"),
    MULTI_SELECT("multi-select"),
    DATE("date"),
    CHECKBOX("checkbox"),
    USER("user"),
    PROGRESSBAR("progressbar"),
    RADIO("radio");

    // 校验方法、VTable cellType 映射方法
}
```

## 6. 错误码设计

从 `ErrorCodeConstants.java` 的 `1_006_xxx` 范围提取为独立枚举：

```java
public enum SmartsheetErrorCode {
    SMARTSHEET_NOT_FOUND(1006001, "表格不存在"),
    SMARTSHEET_ROW_NOT_FOUND(1006002, "行不存在"),
    SMARTSHEET_VERSION_CONFLICT(1006003, "数据已被他人修改，请刷新"),
    SMARTSHEET_ROW_LIMIT_EXCEEDED(1006004, "超出行数上限"),
    SMARTSHEET_COLUMN_LIMIT_EXCEEDED(1006005, "超出列数上限"),
    SMARTSHEET_IMPORT_INVALID_FORMAT(1006006, "导入文件格式不支持"),
    SMARTSHEET_IMPORT_PARSE_ERROR(1006007, "导入文件解析失败"),
    SMARTSHEET_TEMPLATE_NOT_FOUND(1006008, "模板不存在"),
    SMARTSHEET_COLUMN_NOT_FOUND(1006009, "列不存在"),
    SMARTSHEET_PERMISSION_DENIED(1006010, "无权限操作此表格");
}
```

## 7. 前端迁移对照表

### 替换关系

| 现有文件 | V2 处理 | 替换为 |
|---------|---------|--------|
| `SmartSheetGrid.tsx` | **删除** | VTable `<ListTable>` 组件 |
| `SmartSheetToolbar.tsx` | **重写** | VTable 内置工具栏 + 自定义按钮 |
| `SmartSheetStatusBar.tsx` | **删除** | VTable 内置状态栏 |
| `SmartSheetTabsRow.tsx` | **保留改造** | 多 sheet 切换（后续版本） |
| `SmartSheetContextMenu.tsx` | **删除** | VTable 内置 context menu |
| `FormatBar.tsx` | **保留改造** | 映射到 VTable 主题 API |
| `ColorPicker.tsx` | **保留** | 不变 |
| `FindReplaceDialog.tsx` | **删除** | `vtable-search` 插件 |
| `ImportDialog.tsx` | **保留改造** | 适配新 POST `/import` |
| `SmartSheetImportDialog.tsx` | **删除** | 合并到 ImportDialog |
| `ConditionalFormatPanel.tsx` | **删除** | VTable `style` / `theme` 配置 |
| `SmartSheetColumnConfigSheet.tsx` | **保留改造** | 列定义管理 |
| `SmartSheetStatsCards.tsx` | **删除** | VTable 内置聚合 |
| `useSmartSheet.ts` | **重写** | 拆为 `useSmartSheetData` + `useSmartSheetMutation` |
| `useCellFormat.ts` | **删除** | VTable 内置 |
| `useSmartSheetStats.ts` | **删除** | VTable 内置 |
| `smartsheet.api.ts` | **改造** | 改 endpoint 路径 |
| `types.ts` | **精简** | 移除无用类型 |
| `smartsheet-theme.css` | **改造** | VTable 主题变量映射 `--app-*` 令牌 |

### VTable 主题映射

```
VTable 主题变量              ← 映射自
--vtable-bg-color           ← var(--app-color-surface-page)
--vtable-header-bg-color    ← var(--app-color-surface-container)
--vtable-border-color       ← var(--app-color-border-default)
--vtable-font-color         ← var(--app-color-text-primary)
--vtable-selection-bg-color ← var(--app-color-primary-light)
--vtable-stripe-bg-color    ← var(--app-color-surface-container-hover)
```

## 8. 风险与缓解

| 风险 | 等级 | 缓解 |
|------|------|------|
| VTable 版本稳定性 | 低 | v1.26 已发 179 个 release，字节跳动生产使用 |
| Canvas 无障碍 | 中 | VTable 支持 ARIA 属性，需要验证 |
| 自定义编辑器复杂度 | 中 | 先用 VTable 内置 editor，必要时再扩展 |
| 后端迁移数据兼容 | 低 | JSON 列存储不变，新字段有默认值 |
| 团队学习曲线 | 低 | VTable 配置声明式，和写 JSON 配置一样 |

## 9. 不在本次范围

- 实时协作编辑（多人同时编辑一个单元格）— 留到后续版本
- 公式引擎 / 单元格引用 — 非 PM 检查表需求
- 图表集成 — 需要时用 VChart 扩展
- 打印排版优化 — 基础 PDF 导出先可用
