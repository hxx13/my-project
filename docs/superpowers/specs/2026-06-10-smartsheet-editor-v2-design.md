# SmartSheet 编辑器 V2 设计规格

> **状态**: 设计中 | **日期**: 2026-06-10 | **上承**: [SmartSheet V1 设计](2026-06-10-smartsheet-design.md)

## 一、目标

将 SmartSheet 编辑器从"基础 CRUD"提升到 **WPS 级办公表格**：真实可用的工具栏、单元格格式化、查找替换、撤销重做、导入导出、右键菜单。全部功能解耦为独立 React 组件，通过 props 接口联动。

## 二、架构决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 格式存储 | 内联到 cellData JSON | 标准做法（Excel/WPS/Google Sheets） |
| 多 Sheet | V1 不做，V2 扩展 | 先聚焦单 Sheet 编辑体验 |
| 组件化 | 每个功能独立组件 | 解耦，方便后续联动其他模块 |
| 右键菜单 | 仅行操作；复制粘贴用浏览器原生 | 避免冲突 |
| 令牌合规 | 全部颜色/间距/字号通过 --app-* | G04 门禁 |

## 三、组件树

```
SmartSheetPage
├─ SmartSheetToolbar              ← 工具栏卡片
│   ├─ FormatBar                  ← B / I / 底色 / 字体色 / 字号
│   ├─ ViewToggles                ← 斑马纹 / 冻结 / 条件格式开关
│   ├─ ActionGroup                ← 导入 / 导出 / 查找替换 / 保存
│   └─ UndoRedoButtons            ← ↶ 撤销 / ↷ 重做
│
├─ SmartSheetGrid                 ← 表格主体
│   ├─ DataCell                   ← 显示态（应用 fmt）+ 编辑态
│   │   ├─ CellDisplay            ← 渲染格式化值
│   │   └─ CellEditor             ← input/select/checkbox
│   ├─ ContextMenu                ← 右键：插入行/删除行/复制行/上下移
│   └─ ColumnHeader               ← 列头 + 类型标签 + 点击排序
│
├─ SmartSheetStatusBar            ← 行数/列数/填写率
├─ SmartSheetTabsRow              ← V2 多Sheet占位
├─ FindReplaceDialog              ← 查找/替换弹窗
├─ ImportDialog                   ← CSV/Excel 导入 + 列映射
├─ ConditionalFormatPanel         ← 条件格式规则管理
└─ FormatContext (React Context)  ← 当前选中格的格式状态
```

## 四、数据模型

### 4.1 CellData 扩展

```typescript
// 旧：cellData[key] = "85%"
// 新：cellData[key] = { v: "85%", fmt: { b: true } }
type CellValue = {
  v: string;
  fmt?: CellFormat;
};
type CellFormat = {
  b?: boolean;       // bold
  i?: boolean;       // italic
  bg?: string;       // background token
  color?: string;    // font color token
  size?: number;     // 12 | 14 | 16
};
type CellData = Record<string, CellValue>;
```

### 4.2 向后兼容

后端/数据库继续存 JSON 字符串。读写时自动迁移：
- 读到 `"85%"` → 包装为 `{ v: "85%" }`
- 前端编辑后写回完整 `{ v, fmt }` 对象

## 五、Phase 分解

### Phase 1: 紧急修复（立即可做）

| # | 任务 | 文件 | 
|---|------|------|
| 1.1 | ⋮ 菜单溢出检测：贴近底部时向上翻转 | `SmartSheetListPage.tsx` |
| 1.2 | 右键菜单：移除自定义右键中的复制粘贴，保留行操作；浏览器原生复制粘贴正常工作 | `SmartSheetGrid.tsx` |
| 1.3 | 行增删功能：修复 `onAddRow`/`onDeleteRows` prop 链路 | `SmartSheetPage.tsx` → `SmartSheetGrid.tsx` |
| 1.4 | 单元格编辑：修复 Click→编辑→保存流程 | `SmartSheetGrid.tsx` |

### Phase 2: 单元格格式化

| # | 任务 | 文件 |
|---|------|------|
| 2.1 | `FormatContext`：选中的 cell 格式状态管理 | `hooks/useCellFormat.ts` |
| 2.2 | `FormatBar` 组件：B/I/底色/字体色/字号按钮组 | `components/FormatBar.tsx` |
| 2.3 | `CellDisplay`：根据 `fmt` 渲染样式 | `SmartSheetGrid.tsx` 内 |
| 2.4 | cellData 读写兼容层：`normalizeCellValue()` 自动包装纯字符串 | `api/` + `hooks/` |
| 2.5 | 底色/字体色颜色板：8 色预设 + 引用 `--app-color-*` | `components/ColorPicker.tsx` |

### Phase 3: 工具栏真实化

| # | 任务 | 文件 |
|---|------|------|
| 3.1 | 撤销/重做按钮接入 undoRedo hook | `SmartSheetToolbar.tsx` |
| 3.2 | 斑马纹/冻结/条件格式开关真实生效 + 状态持久化到 sheet config | `SmartSheetToolbar.tsx` + `SmartSheetGrid.tsx` |
| 3.3 | 保存按钮：实时保存 or 手动保存 + 脏状态指示 | `SmartSheetToolbar.tsx` |
| 3.4 | 查找替换弹窗：`Ctrl+F` 唤起 + 逐格匹配 + 替换 | `components/FindReplaceDialog.tsx` |

### Phase 4: 导入导出

| # | 任务 | 文件 |
|---|------|------|
| 4.1 | 导入对话框：上传 CSV → 预览 → 列映射 → 确认导入 | `ImportDialog.tsx`（重写现有 stub） |
| 4.2 | 导出 Excel：后端 FastExcel 生成 .xlsx | 后端新端点 |
| 4.3 | 导出 CSV：现有端点增强，支持格式化的显示值 | 后端增强 |

### Phase 5: 条件格式

| # | 任务 | 文件 |
|---|------|------|
| 5.1 | 条件格式规则面板：≥/≤/= + 颜色标记 | `ConditionalFormatPanel.tsx` |
| 5.2 | 规则存储到 sheet config | 后端扩展 |
| 5.3 | 渲染时应用规则（绿色高亮/红色告警） | `CellDisplay` 内 |

## 六、验收标准

- [ ] 列表页 ⋮ 菜单不超出画面
- [ ] 表格右键仅行操作，Ctrl+C/V 浏览器原生可用
- [ ] 增删行、编辑单元格正常工作
- [ ] B/I/底色/字体色/字号 全部可用，格式持久化到 DB
- [ ] 撤销/重做（Ctrl+Z/Y + 工具栏按钮）正常
- [ ] 查找替换弹窗可用
- [ ] 导入 CSV → 预览 → 映射 → 确认全流程
- [ ] 导出 CSV/Excel 文件内容正确
- [ ] 条件格式规则可配置、渲染生效
- [ ] 所有颜色/字号通过 `--app-*` 令牌引用（G04）
- [ ] 每个新组件独立文件，props 接口清晰可复用