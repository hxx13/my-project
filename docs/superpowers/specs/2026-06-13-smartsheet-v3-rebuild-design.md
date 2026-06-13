# Smartsheet V3 — 完全重建 设计方案

> 状态：设计完成 → 待用户审批
> 日期：2026-06-13
> 替换：[V2 设计](2026-06-13-smartsheet-v2-vtable-design.md)

## 1. 背景

V2 改造保留了旧组件、旧的预设模板、旧的工具栏，导致新旧代码混杂，交互体验不一致。V3 完全推倒重来：

- **删除**所有硬编码预设模板、所有旧工具栏按钮、所有旧组件
- **基于 VTable 原生能力**构建最小工具栏，VTable 内置功能零代码获得
- **自定义模板系统**替代硬编码预设

## 2. 架构

### 前端文件结构（净结果：8 个文件）

```
src/features/smartsheet/
├── SmartSheetListPage.tsx          ← 全新设计：系统预设 + 我的模板 + 表格列表
├── SmartSheetPage.tsx              ← VTable 原生优先：5 按钮工具栏 + ListTable
├── components/
│   ├── ImportDialog.tsx            ← 改造：适配新 POST /import API
│   └── ColumnConfigPanel.tsx       ← 新建：列配置侧面板
├── hooks/
│   ├── useSmartSheetData.ts        ← 数据桥接
│   └── useSmartSheetMutation.ts    ← 变更提交
├── vtable-config/
│   └── columns.ts                  ← 列定义 + 默认值工具
└── types.ts                        ← 精简类型（无 PRESET_TEMPLATES）
```

### 删除清单（10 个文件）

`SmartSheetToolbar` `SmartSheetTabsRow` `FormatBar` `ColorPicker`
`SmartSheetColumnConfigSheet` `SmartSheetImportDialog`
`useSmartSheet` `useCellFormat` `useSmartSheetStats`
`vtable-config/editors.ts` `vtable-config/theme.ts`

### 组件职责

| 文件 | 单一职责 |
|------|---------|
| `SmartSheetListPage` | 列表页：系统预设卡片 + 我的模板卡片 + 表格行列表 |
| `SmartSheetPage` | 编辑页：渲染 VTable + 5 按钮工具栏 |
| `ImportDialog` | 文件上传 → 预览 → 确认导入 |
| `ColumnConfigPanel` | 侧面板：列 CRUD、类型切换、选项管理 |
| `useSmartSheetData` | 拉取 sheet + rows，构建 VTable option |
| `useSmartSheetMutation` | cell PATCH、addRow、deleteRow、addColumn |
| `columns.ts` | ColumnConfig→VTable columns 映射 + 默认值 |

## 3. 模板系统

### 数据模型

复用 `smartsheet_definition` 表，`is_template` 字段标记。

### 系统预设（2 个，硬编码在列表页）

| 名称 | 列配置 |
|------|--------|
| 勾选清单 | `{key:"col_check", type:"checkbox", label:"结果"}` `{key:"col_note", type:"text", label:"备注"}` `{key:"col_inspector", type:"user", label:"检查人"}` |
| 数据表格 | `{key:"col_name", type:"text", label:"名称"}` `{key:"col_status", type:"select", options:["在用","闲置","报废"], label:"状态"}` `{key:"col_date", type:"date", label:"日期"}` |

### API

| 操作 | 端点 | 说明 |
|------|------|------|
| 列出模板 | `GET /api/admin/smartsheet/templates` | 只返回 `is_template=1` 的 sheet |
| 保存模板 | `POST /api/admin/smartsheet/template` | body: `{sheetId}` → 设 `is_template=1` |
| 取消模板 | `DELETE /api/admin/smartsheet/template/{id}` | 删除模板（或设 `is_template=0`） |
| 从模板创建 | `POST /api/admin/smartsheet/sheet/from-template/{id}` | body: `{name}` |

### 用户流程

```
列表页 → 点系统预设/我的模板 → 创建表格 → 进入编辑页
     → 点「空白表格」→ 创建空表 → 进入编辑页
编辑页 → 设计好列结构 → 点「存模板」→ 模板出现在列表页「我的模板」
列表页 → 我的模板卡片 → 删除按钮 → 移除模板
```

## 4. 表格编辑页

### 工具栏（5 个核心按钮）

```
[表格名称]  [ + 添加行 ]  [ 📥 导入 ]  [ 📤 导出 ]  [ 💾 存模板 ]  [ ⚙️ 列配置 ]
```

每个按钮触发的内容：
- **添加行**：`addRow()` → 后端初始化默认值（checkbox=false, number=0）
- **导入**：打开 ImportDialog → 选文件 → 预览 → 确认
- **导出**：下拉选择 CSV / Excel → 触发下载
- **存模板**：确认 → `POST /template` → toast 提示
- **列配置**：打开 ColumnConfigPanel 侧面板

### VTable 原生能力（不写代码，纯配置获得）

- 点击编辑单元格（`editCellTrigger: 'click'`）
- Checkbox/Radio/Progressbar 单元格类型（`cellType` 配置）
- 列头排序（`sortState`）
- 列头筛选（`filterRules`）
- 冻结窗格（`frozenColCount`/`frozenRowCount`）
- 斑马纹（主题 `stripe` 配置）
- 右键菜单（`contextMenuItems`）
- 撤销/重做（`Ctrl+Z`/`Ctrl+Y`）
- 复制/粘贴（`Ctrl+C`/`Ctrl+V`）
- 列宽拖拽（内置）
- 列拖拽换位（内置）
- 键盘导航（Arrow/Tab/Enter）
- 自动填充（`autoFill: true`）
- 搜索（`@visactor/vtable-search` 插件，作为备选；优先用 VTable 内置）

### ARCO 主题 + Bento 颜色覆盖

```javascript
VTable.themes.ARCO.extends({
  defaultStyle: { bgColor: 'var(--app-color-surface-container)' },
  headerStyle: { bgColor: 'var(--app-color-surface-page)' },
  frameStyle: { borderColor: 'var(--app-color-border-default)' },
  selectionStyle: { cellBgColor: 'var(--app-color-primary-light)' },
})
```

## 5. 列配置面板

侧拉面板，点击工具栏齿轮打开：

- 列列表（显示所有列的名称/类型）
- 添加列：输入名称 → 选类型 → 确定
- 列详情：重命名 / 换类型 / 设选项（select/radio） / 设必填
- 删除列（确认）
- 排序（拖拽上下移动列）

## 6. 后端改动

### 新增

| 端点 | 说明 |
|------|------|
| `DELETE /api/admin/smartsheet/template/{id}` | 取消模板标记 |

### 已有（V2 已实现，可用）

Sheet CRUD、Row CRUD、Cell PATCH、Import（POI）、Export CSV/XLSX、Templates CRUD

## 7. 数据流

```
SmartSheetPage
  useSmartSheetData(sheetId)
    → GET /sheet/{id} + GET /rows
    → 构建 VTable option: { columns, records, theme, ... }
    → <ListTable option={option} onChangeCellValue={handler} />

  用户编辑单元格
    → onChangeCellValue({ col, row, rawValue })
    → handleCellChange(rowId, columnKey, rawValue, version)
    → PATCH /row/{id}/cell  { columnKey, value, expectedVersion }
    → 后端乐观锁 + JSON 更新 + 列级变更日志
```

## 8. 不在范围

- 实时协作编辑（多人同时编辑同一单元格）
- 公式引擎 / 单元格引用
- 多 sheet 标签切换
- 图表 / 透视表
- VTable-search 插件（如不兼容则用 VTable 内置搜索）

## 9. 风险

| 风险 | 缓解 |
|------|------|
| ARCO 主题+Bento 覆盖的颜色协调 | 先覆盖核心 5 色，其余保持 ARCO 默认 |
| vtable-search 插件 React 兼容 | 优先用 VTable 内置搜索；插件作为备选 |
| ImportDialog 适配新 API | 预览用 import API 返回的 preview 字段 |