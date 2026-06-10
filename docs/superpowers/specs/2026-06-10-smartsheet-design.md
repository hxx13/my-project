# SmartSheet — 高灵活度智能表格 · 设计规格

> **状态**：设计完成 · 待实现
> **版本**：1.0
> **日期**：2026-06-10
> **作者**：hxx13
> **关联文档**：`docs/开发参考/后端手册/Excel 导入导出.md`

---

## 1. 概述与上下文

### 1.1 目标

构建一个**高灵活度、用户可自由配置**的类 Excel 智能表格模块（SmartSheet）。用户通过配置列类型、预设选项、行实体来源，即可创建多种业务表格——无需写代码，无需改数据库。

### 1.2 核心约束

| 约束 | 值 | 原因 |
|------|-----|------|
| 单表最大行数 | 500 | 用户确认的使用场景 |
| 单表最大列数 | 100 | 用户确认的使用场景 |
| 无公式计算 | — | 用户明确不需要，降低复杂度 |
| 开源组件引擎 | revo-grid (MIT) | 已选型，替代 Handsontable 避免商用 License |
| 后端 Excel | FastExcel（已有） | 复用 `yudao-spring-boot-starter-excel` |

### 1.3 设计原则

1. **JSON 驱动**：列定义、单元格数据、行实体来源全部用 JSON 存储，加列不改表结构
2. **模板是快捷入口，不是限制**：四种预设模板（Matrix/Table/Checklist/Calendar）仅提供初始配置，用户可自由增删改列
3. **融入而非替代**：复用 AdminPageShell、PersonnelSearchDropdown、ErrorCodeConstants、shadcn/ui 组件体系
4. **亮暗并重**：所有 UI 同时适配亮色和暗色主题，同等重视不可偏废。暗色参考 Linear/Vercel 现代风格（`#09090b` 根底 + `#818cf8` 靛紫强调色），亮色沿用项目现有 Tailwind/shadcn 语义色体系

---

## 2. 架构分层总览

### 2.1 模块归属

```
前端: frontend/src/features/smartsheet/
后端: src/main/java/com/example/demo/modules/smartsheet/
```

### 2.2 数据流

```
┌──────────────────────────────────────┐
│  浏览器 (revo-grid)                   │
│  ├─ SmartSheetGrid (核心表格)         │
│  ├─ SmartSheetToolbar (工具栏)       │
│  └─ SmartSheetStatsPanel (统计面板)  │
└──────────────┬───────────────────────┘
               │ REST JSON / File Upload
┌──────────────▼───────────────────────┐
│  SmartsheetController                │
│  ├─ sheet CRUD (5 endpoints)         │
│  ├─ row CRUD (5 endpoints)           │
│  ├─ export (1 endpoint, FastExcel)   │
│  └─ import (1 endpoint, FastExcel)   │
└──────────────┬───────────────────────┘
               │
┌──────────────▼───────────────────────┐
│  SmartsheetService / RowService      │
│  ├─ 列配置 JSON Schema 校验          │
│  ├─ 乐观锁版本控制                    │
│  └─ 行实体引用解析                    │
└──────────────┬───────────────────────┘
               │ MyBatis
┌──────────────▼───────────────────────┐
│  MySQL: smartsheet_definition        │
│         smartsheet_row               │
│         smartsheet_change_log        │
└──────────────────────────────────────┘
```

---

## 3. 数据库变更

### 3.1 新建表

```sql
-- 表格定义表
CREATE TABLE smartsheet_definition (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(200)  NOT NULL COMMENT '表格名称',
    description VARCHAR(500)  DEFAULT '' COMMENT '描述',
    layout_mode VARCHAR(20)   NOT NULL DEFAULT 'table' COMMENT '布局模式: matrix/table/checklist/calendar',
    columns_config JSON       NOT NULL COMMENT '列定义 [{key,label,type,options,required,defaultValue,width,...}]',
    row_entity_source JSON    DEFAULT NULL COMMENT '行实体来源配置 {type:manual|reference, tableName, labelField, filterField}',
    template_id  BIGINT       DEFAULT NULL COMMENT '从哪个模板创建，用于模板升级提示',
    created_by   BIGINT       COMMENT '创建人',
    updated_by   BIGINT       COMMENT '更新人',
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_template (template_id),
    INDEX idx_created_by (created_by)
) COMMENT '智能表格定义';

-- 数据行表
CREATE TABLE smartsheet_row (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    sheet_id    BIGINT        NOT NULL COMMENT 'FK → smartsheet_definition.id',
    row_index   INT           NOT NULL DEFAULT 0 COMMENT '行序号，用于排序',
    row_entity_id VARCHAR(100) DEFAULT NULL COMMENT '行实体引用ID（如机房ID）',
    row_label   VARCHAR(200)  DEFAULT '' COMMENT '行头显示名称（Matrix/Checklist/Calendar模式）',
    cell_data   JSON          NOT NULL COMMENT '单元格数据 {"col_key":"value",...}',
    version     INT           NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_sheet (sheet_id),
    UNIQUE KEY uk_sheet_entity (sheet_id, row_entity_id)
) COMMENT '智能表格数据行';

-- 变更日志表（单元格历史功能）
CREATE TABLE smartsheet_change_log (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    sheet_id    BIGINT        NOT NULL,
    row_id      BIGINT        NOT NULL,
    column_key  VARCHAR(100)  NOT NULL COMMENT '列 key',
    old_value   TEXT          COMMENT '旧值',
    new_value   TEXT          COMMENT '新值',
    changed_by  BIGINT        COMMENT '修改人',
    changed_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_row (row_id),
    INDEX idx_sheet_time (sheet_id, changed_at)
) COMMENT '智能表格变更日志';
```

### 3.2 兼容性分析

- 全新表，无兼容性问题
- JSON 字段依赖 MySQL 5.7+（项目已满足）
- 迁移方式：`scripts/migration/V*_smartsheet.sql`

---

## 4. 后端 API 契约

### 4.1 Sheet CRUD

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/admin-api/smartsheet/sheet/page` | 表格分页列表 | smartsheet:list |
| POST | `/admin-api/smartsheet/sheet` | 新建表格 | smartsheet:create |
| GET | `/admin-api/smartsheet/sheet/{id}` | 获取表格详情+列定义 | smartsheet:edit |
| PUT | `/admin-api/smartsheet/sheet/{id}` | 更新表格（名称/列定义） | smartsheet:edit |
| DELETE | `/admin-api/smartsheet/sheet/{id}` | 删除表格（级联删除行） | smartsheet:delete |

### 4.2 Row CRUD

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin-api/smartsheet/{sheetId}/rows` | 获取所有行（按 row_index 排序） |
| POST | `/admin-api/smartsheet/{sheetId}/row` | 新增一行 |
| PUT | `/admin-api/smartsheet/{sheetId}/row/{rowId}` | 更新单行（单格/多格编辑均走此接口，含 version 乐观锁） |
| DELETE | `/admin-api/smartsheet/{sheetId}/row/{rowId}` | 删除行 |
| POST | `/admin-api/smartsheet/{sheetId}/rows/batch` | 批量新增（导入用） |

### 4.3 导入导出

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin-api/smartsheet/{sheetId}/export` | 导出 Excel（FastExcel 动态表头） |
| POST | `/admin-api/smartsheet/{sheetId}/import` | 导入 Excel（接收 MultipartFile） |

### 4.4 统计

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin-api/smartsheet/{sheetId}/stats` | 列级统计（计数/求和/均值/去重/空值率） |

### 4.5 请求/响应 DTO 要点

- Sheet 创建请求含 `columns_config` JSON，后端做 Schema 校验
- 行更新请求含 `version` 字段，后端比对 → 不匹配返回 409 Conflict
- 导出接口直接 write response（`void` 返回），同项目现有导出模式

---

## 5. 前端组件接口契约

### 5.1 组件树

```
SmartSheetPage (路由页)
├── SmartSheetToolbar
│   ├── 表格切换 Dropdown
│   ├── [新建] [导入Excel] [导出Excel ▾]
│   ├── [+ 添加行] [+ 添加列]
│   ├── 视图微控件组 (斑马纹·冻结·条件格式 toggle)
│   ├── [查找] [撤销] [重做]
│   └── [保存]
├── SmartSheetGrid (revo-grid 封装)
│   ├── 列头渲染（含类型标签 + ⚙配置图标 + 排序/筛选指示器）
│   ├── 行头渲染（Matrix/Checklist/Calendar 模式，含 ⚙配置图标）
│   ├── 单元格编辑器注册表
│   └── 选区/复制粘贴/键盘导航
├── SmartSheetStatsPanel (可折叠右侧面板)
│   ├── 选中列统计（按列类型展示分布/均值/去重）
│   └── 条件格式规则列表
├── SmartSheetColumnConfigSheet (shadcn Sheet，右侧滑出)
│   ├── 列名称/类型/必填/默认值
│   ├── 预设选项管理（select/multi-select 类型）
│   └── 列宽/排序/删除列
├── SmartSheetImportDialog (导入预览映射弹窗)
│   └── Excel列名 → 表格列映射 + 跳过/创建新列
└── SmartSheetChangeLogPopover (单元格变更历史 Popover)
```

### 5.2 核心 Hook

```typescript
// useSmartSheet.ts — 表格数据查询与变更
function useSmartSheet(sheetId: string): {
  sheet: SmartSheetDefinition | null;
  rows: SmartSheetRow[];
  isLoading: boolean;
  updateCell: (rowId: string, colKey: string, value: string) => Promise<void>;
  addRow: () => Promise<void>;
  deleteRows: (rowIds: string[]) => Promise<void>;
  updateColumn: (colKey: string, config: Partial<ColumnConfig>) => Promise<void>;
  undo: () => void;
  redo: () => void;
}

// useSmartSheetStats.ts — 列统计
function useSmartSheetStats(sheetId: string, colKey: string): ColumnStats | null
```

### 5.3 核心 Types

```typescript
type LayoutMode = 'matrix' | 'table' | 'checklist' | 'calendar';

type ColumnType = 'select' | 'multi-select' | 'date' | 'checkbox' | 'number' | 'text' | 'user';

interface ColumnConfig {
  key: string;           // 唯一标识，如 "col_status"
  label: string;         // 显示名称，如 "状态"
  type: ColumnType;
  options?: string[];    // select/multi-select 的预设选项
  required?: boolean;
  defaultValue?: string;
  width?: number;
  min?: number;          // number 类型
  max?: number;          // number 类型
  decimal?: number;      // number 小数位
}

interface RowEntitySource {
  type: 'manual' | 'reference';
  tableName?: string;   // 引用表名（如 "fm_site"）
  labelField?: string;  // 显示字段（如 "name"）
  valueField?: string;  // 值字段（如 "id"）
}

interface SmartSheetDefinition {
  id: string;
  name: string;
  description: string;
  layoutMode: LayoutMode;
  columnsConfig: ColumnConfig[];
  rowEntitySource?: RowEntitySource;
  templateId?: string;
  createdAt: string;
  updatedAt: string;
}

interface SmartSheetRow {
  id: string;
  sheetId: string;
  rowIndex: number;
  rowLabel: string;     // 行头名称
  cellData: Record<string, string>; // { "col_key": "value" }
  version: number;
}
```

---

## 6. 安全设计

| 层面 | 措施 |
|------|------|
| 认证 | 复用现有 Spring Security + Token 机制，所有接口需登录 |
| 鉴权 | 5 个权限码: `smartsheet:list/create/edit/delete/export` |
| 输入校验 | columns_config JSON 后端做 Schema 校验，拒绝非法类型/超大 options |
| 并发控制 | smartsheet_row.version 乐观锁，冲突返回 409 |
| 文件上传 | Excel 导入限制 .xlsx/.xls/.csv，max 10MB |
| XSS | 单元格文本渲染时 DOMpurify 净化（项目已有） |

---

## 7. 路由与导航

| 路由 | 页面 | 权限 |
|------|------|------|
| `/admin/smartsheet` | 表格管理列表页 | smartsheet:list |
| `/admin/smartsheet/new` | 新建表格（含模板选择） | smartsheet:create |
| `/admin/smartsheet/:id` | 表格编辑器 | smartsheet:edit |

- 注册到 `adminNavRegistry.ts`，"内容管理" 分组下新增"智能表格"
- 列表页复用 `AdminPageShell` + `AdminDataTableWrap` 模式

---

## 8. 数据对接清单

| 新 API | 调用方 |
|--------|--------|
| `GET /sheet/page` | SmartSheetPage（列表） |
| `POST /sheet` | SmartSheetPage（新建） |
| `GET /sheet/{id}` | SmartSheetPage（加载编辑器） |
| `PUT /sheet/{id}` | SmartSheetColumnConfigSheet（列变更） |
| `DELETE /sheet/{id}` | SmartSheetPage（删除） |
| `GET /{sheetId}/rows` | SmartSheetGrid（初始加载） |
| `POST /{sheetId}/row` | SmartSheetToolbar（添加行） |
| `PUT /{sheetId}/row/{rowId}` | SmartSheetGrid（单元格编辑，600ms debounce） |
| `DELETE /{sheetId}/row/{rowId}` | SmartSheetGrid（右键删除行） |
| `POST /{sheetId}/rows/batch` | SmartSheetImportDialog（导入确认后） |
| `GET /{sheetId}/export` | SmartSheetToolbar（导出按钮） |
| `POST /{sheetId}/import` | SmartSheetToolbar（导入按钮） |
| `GET /{sheetId}/stats` | SmartSheetStatsPanel（选中列时触发） |

---

## 9. 可复用模块清单

| 模块 | 路径 | 用途 |
|------|------|------|
| AdminPageShell | `@/components/admin/AdminPageShell` | 列表页壳 |
| AdminDataTableWrap | `@/components/admin/AdminPageShell` | 列表分页表格 |
| PersonnelSearchDropdown | `@/components/ui/PersonnelSearchDropdown` | user 列类型编辑器 |
| shadcn Sheet | `@/components/ui/sheet` (或 radix) | 列配置侧滑面板 |
| shadcn Dialog | `@/components/ui/dialog` | 导入映射/删除确认弹窗 |
| shadcn DropdownMenu | `@/components/ui/dropdown-menu` | 导出选项菜单/右键菜单 |
| useQuery / useMutation | `@tanstack/react-query` | 数据获取与变更 |
| downloadBlob | 已有模式（多处使用） | Excel 文件下载 |
| ErrorCodeConstants | `common/exception/ErrorCodeConstants.java` | 错误码 |
| FastExcel ExcelUtils | `yudao-spring-boot-starter-excel` | 后端 Excel 读写 |

---

## 10. 新增文件清单

### 新建

| 文件 | 说明 |
|------|------|
| `frontend/src/features/smartsheet/SmartSheetPage.tsx` | 路由页（编辑器容器） |
| `frontend/src/features/smartsheet/SmartSheetListPage.tsx` | 表格管理列表页 |
| `frontend/src/features/smartsheet/components/SmartSheetToolbar.tsx` | 工具栏 |
| `frontend/src/features/smartsheet/components/SmartSheetGrid.tsx` | revo-grid 封装 |
| `frontend/src/features/smartsheet/components/SmartSheetStatsPanel.tsx` | 统计面板 |
| `frontend/src/features/smartsheet/components/SmartSheetColumnConfigSheet.tsx` | 列配置侧滑 |
| `frontend/src/features/smartsheet/components/SmartSheetImportDialog.tsx` | 导入映射弹窗 |
| `frontend/src/features/smartsheet/components/SmartSheetChangeLogPopover.tsx` | 变更历史 |
| `frontend/src/features/smartsheet/hooks/useSmartSheet.ts` | 核心数据 Hook |
| `frontend/src/features/smartsheet/hooks/useSmartSheetStats.ts` | 统计 Hook |
| `frontend/src/features/smartsheet/types.ts` | 类型定义 |
| `frontend/src/features/smartsheet/smartsheetNavRegistry.ts` | 导航注册 |
| `frontend/src/api/domains/smartsheet.api.ts` | API 函数 |
| `frontend/src/styles/smartsheet-theme.css` | revo-grid 主题桥接 CSS |
| `src/main/java/.../smartsheet/controller/SmartsheetController.java` | 后端 Controller |
| `src/main/java/.../smartsheet/service/SmartsheetService.java` | 后端 Service |
| `src/main/java/.../smartsheet/service/SmartsheetRowService.java` | 后端行 Service |
| `src/main/java/.../smartsheet/mapper/SmartsheetDefinitionMapper.java` | Mapper |
| `src/main/java/.../smartsheet/mapper/SmartsheetRowMapper.java` | Mapper |
| `src/main/java/.../smartsheet/mapper/SmartsheetChangeLogMapper.java` | Mapper |
| `src/main/java/.../smartsheet/vo/*.java` | 各种 VO/DTO（约 8 个） |
| `scripts/migration/V*_smartsheet.sql` | SQL 迁移 |

### 修改

| 文件 | 改动 |
|------|------|
| `frontend/src/router/index.tsx` | 添加 3 条 lazy route |
| `frontend/src/features/admin/adminNavRegistry.ts` | 注册智能表格菜单 |
| `src/main/java/.../ErrorCodeConstants.java` | 新增 SMARTSHEET 错误码段 |
| `frontend/package.json` | 新增 `@revolist/revogrid` 依赖 |

### 明确不修改

- `DailyInspectionPanel.tsx` — 第一阶段不动，第二阶段并存
- AdminPageShell / AdminDataTableWrap — 只调用，不改源码
- 现有 auth / HTTP 拦截器 / 异常处理机制

---

## 11. 导入变更

```typescript
// 新增 npm 依赖
// package.json
"@revolist/revogrid": "^4.x"    // MIT
```

```typescript
// router/index.tsx 新增
const SmartSheetPage = lazy(() => import('@/features/smartsheet/SmartSheetPage'));
const SmartSheetListPage = lazy(() => import('@/features/smartsheet/SmartSheetListPage'));
```

---

## 12. 边缘情况与错误处理

| # | 场景 | 处理方式 |
|---|------|---------|
| 1 | 导入列数 > 100 | 后端校验 → 400 + "最大支持 100 列" |
| 2 | 导入行数 > 500 | 后端校验 → 400 + "单表最大 500 行" |
| 3 | 列类型变更冲突（select → number） | 前端警告 "将清空该列已有数据" → 用户确认后执行 |
| 4 | 并发编辑冲突 | 乐观锁 version 不匹配 → 409 + "数据已被他人修改，请刷新" |
| 5 | JSON 列定义非法 | 后端 Schema 校验 → 400 + 具体字段错误详情 |
| 6 | Excel 格式不支持 | 仅接受 .xlsx/.xls/.csv → 400 |
| 7 | 删除有数据的表格 | 前端确认弹窗 → 级联删除所有行 + 变更日志 |
| 8 | 导入列映射失败 | 未匹配列显示 "跳过" / "创建新列"，不允许静默丢弃 |
| 9 | 空表格（无边数据行） | 正常渲染空表头，占位提示 "暂无数据，点击 + 添加行" |
| 10 | 网络断开 | 编辑操作排队，重连后自动 flush（revogrid + 现有 HTTP 重试机制） |
| 11 | 权限不足 | 403 → 全局异常处理器返回统一格式 |
| 12 | 行实体引用数据源不可用 | 降级显示已有数据，列头标记 ⚠ "数据源连接失败" |

---

## 13. 约束与原则

### 明确不做

1. **不做公式计算引擎** — 不在前端或后端实现 `=SUM()` 等 Excel 公式解析
2. **不做实时协作（OT/CRDT）** — 多人编辑用乐观锁 + 5 秒轮询同步，不引入 WebSocket 协作
3. **不做富文本单元格** — 单元格仅存纯文本，不支持 Markdown 渲染或文件附件
4. **不做打印布局** — 不提供 PDF 导出或打印样式优化
5. **不删旧代码** — DailyInspectionPanel 等旧组件在第一阶段继续运行，仅在新模板中验证功能对齐

### 必须遵守

1. 所有列定义变更必须记录到 change_log
2. 暗色主题所有文字必须 WCAG AA（对比度 ≥ 4.5:1）
3. 前端状态管理使用 `@tanstack/react-query`，不引入额外状态库
4. revo-grid 主题通过 CSS 变量注入，不覆盖组件内部样式

---

## 14. 错误码定义

在 `ErrorCodeConstants.java` 新增 SMARTSHEET 段（建议范围 2100-2199）：

| 错误码 | 枚举名 | 中文描述 | HTTP |
|--------|--------|---------|------|
| 2100 | SMARTSHEET_NOT_FOUND | 表格不存在 | 404 |
| 2101 | SMARTSHEET_COLUMN_INVALID | 列定义不合法 | 400 |
| 2102 | SMARTSHEET_TOO_MANY_COLUMNS | 超过最大列数限制(100) | 400 |
| 2103 | SMARTSHEET_TOO_MANY_ROWS | 超过最大行数限制(500) | 400 |
| 2104 | SMARTSHEET_VERSION_CONFLICT | 数据已被他人修改，请刷新 | 409 |
| 2105 | SMARTSHEET_IMPORT_FORMAT | 不支持的文件格式，仅接受 .xlsx/.xls/.csv | 400 |
| 2106 | SMARTSHEET_ROW_NOT_FOUND | 数据行不存在 | 404 |
| 2107 | SMARTSHEET_COLUMN_TYPE_CONFLICT | 列类型变更将清空已有数据 | 400 |
| 2108 | SMARTSHEET_TEMPLATE_NOT_FOUND | 模板不存在 | 404 |

---

## 15. 测试边界

| 层级 | 测什么 | 不测什么 | 工具 |
|------|--------|---------|------|
| 后端 Service | columns_config JSON Schema 校验、乐观锁冲突、行数/列数超限拒绝、Excel 导入解析 | revo-grid 渲染 | JUnit + MockMvc |
| 后端 Controller | API 响应格式、异常路径 12 条、权限拦截 | Service 内部逻辑 | MockMvc |
| 前端 Hook | useSmartSheet 状态流转、cell update debounce、undo/redo 栈 | 实际 DOM 渲染 | Vitest + React Testing Library |
| 前端组件 | SmartSheetGrid 列编辑器注册表、Toolbar 按钮行为 | Canvas/DOM 像素级对比 | Playwright browser_snapshot |
| 门禁 | G02（弹窗/Dialog）、G03（表格 re-render 计数） | — | browser_evaluate |

---

## 16. 日志与可观测性

日志前缀：`[SmartSheet]`

| 事件 | 级别 | 日志内容 |
|------|------|---------|
| 表格创建 | INFO | `[SmartSheet] sheet created id={id} mode={layout_mode} cols={n}` |
| 列定义变更 | INFO | `[SmartSheet] columns updated sheet={id} changes={...}` |
| 导入完成 | INFO | `[SmartSheet] import done sheet={id} rows={n} file={name}` |
| 版本冲突 | WARN | `[SmartSheet] version conflict sheet={id} row={rowId} client={v1} server={v2}` |
| Schema 校验失败 | WARN | `[SmartSheet] schema validation failed sheet={id} errors={...}` |
| 文件格式错误 | WARN | `[SmartSheet] bad import format sheet={id} file={name}` |

---

## 17. Z 轴层级

| 元素 | z-index | 说明 |
|------|---------|------|
| SmartSheetGrid 内部 | 0-2 | 单元格选中 (z=1)、行头/列头冻结 (z=2) |
| Toolbar Dropdown | 50 | shadcn DropdownMenu 默认 |
| 列配置 Sheet | 50 | shadcn Sheet 右侧滑出 |
| 导入 Dialog | 50 | shadcn Dialog 居中弹窗 |
| 单元格变更 Popover | 40 | 右键弹出 |

所有浮层严格使用 shadcn 默认 z-index 体系，不自定义 `z-99999`。

---

## 18. 清理清单（第二阶段）

当 SmartSheet 功能稳定后，执行以下清理：

- [ ] `DailyInspectionPanel.tsx` 标记 `@deprecated`，路由指向 SmartSheet Matrix 模式
- [ ] 旧巡查表 API（`/fm/daily-inspection/*`）评估是否可下线
- [ ] `AdminFacilityMaintenancePage` 中巡查表区域替换为 SmartSheet 嵌入组件
- [ ] 移除旧巡查表相关未使用的 import 和类型定义
