# 填报报表 — 字段类型系统修复 + 工具栏重构 实施计划

> **日期:** 2026-06-13
> **状态:** ✅ Phase A-D 完成，Phase E 部分完成（OptionSet 关联已建立，填写端加载待后续迭代）
> **目标:** 修复字段类型编辑器无预览、选项配置体验差、类型语义错误等问题，重构编辑器布局为顶部工具栏模式。

---

## 一、问题诊断

| # | 问题 | 根因 |
|---|------|------|
| 1 | 切换字段类型后编辑器格子无变化 | [FormGridEditor.tsx:159-168](frontend/src/features/report-form/components/FormGridEditor.tsx#L159-L168) 所有 field 类型统一渲染蓝色标签文字 |
| 2 | IMAGE/FILE 混入字段类型 | 图片嵌入/文件上传是编辑器能力，不应作为数据采集类型 |
| 3 | USER 应是协同编辑记录戳 | 当前是手动选择器，缺乏自动记录当前用户的能力 |
| 4 | 选项编辑体验差 | 一个 textarea 逐行输入，label=value 不分，无增删排序 |
| 5 | OptionSetManager 未集成 | `optionSetId` 字段存在于 FieldDefinition 但未在 FieldInspector 中使用 |
| 6 | 右侧面板占用空间 | FieldInspector 所有属性应上移至顶部工具栏 |
| 7 | 必填无效 | 功能未落地，用户不需要 |
| 8 | 字段 Key 无意义 | 内部标识符，对设计者无价值 |
| 9 | 原生取色器渲染卡 | `<input type="color">` 性能差 |

---

## 二、类型系统变更

### 2.1 FieldType 扩展

```typescript
// 变更前
export type FieldType = 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'SELECT'
  | 'MULTI_SELECT' | 'DATETIME' | 'IMAGE' | 'FILE' | 'USER';

// 变更后
export type FieldType = 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'SELECT'
  | 'MULTI_SELECT' | 'DATETIME' | 'IMAGE' | 'FILE' | 'USER' | 'AUTO_USER';
```

### 2.2 各类型语义

| 类型 | 中文名 | 语义 | 填写端行为 |
|------|--------|------|-----------|
| TEXT | 文本 | 单行文本输入 | `<input type="text">` |
| NUMBER | 数字 | 数值输入 | `<input type="number">` |
| BOOLEAN | 勾选 | 布尔勾选 | `<input type="checkbox">` |
| SELECT | 单选下拉 | 预设选项中选择一个 | `<select>` 下拉 |
| MULTI_SELECT | 多选下拉 | 预设选项中选择多个 | checkbox 组 |
| DATETIME | 日期时间 | 日期/时间输入 | `<input type="datetime-local">` |
| IMAGE | 图片 | **保留**：数据采集（填表人上传图片URL） | URL输入+预览 |
| FILE | 文件 | **保留**：数据采集（填表人上传文件） | 文件上传按钮 |
| USER | 人员选择 | **保留**：手动选择用户 | UserSelector |
| **AUTO_USER** | **自动记录** | **新增**：系统自动填入当前用户名+时间戳，不可编辑 | 灰色只读文本 |

### 2.3 FieldDefinition 变更

```typescript
export interface FieldDefinition {
  type: FieldType;
  label: string;
  // ❌ 移除: required
  // ❌ 移除: editableInFill（暂保留向后兼容，工具栏不显示）
  // ❌ 移除: editableByRoles（暂保留向后兼容）
  maxLength?: number;
  min?: number; max?: number; step?: number;
  optionSetId?: string;          // ✅ 本次打通 OptionSetManager
  options?: { label: string; value: string }[];
  autoRecordTimestamp?: boolean; // ✅ 新增: AUTO_USER 专用
  props?: Record<string, unknown>;
}
```

### 2.4 GridCell 变更

```typescript
export interface GridCell {
  id: string;
  row: number; col: number;
  colSpan: number; rowSpan: number;
  kind: CellKind;
  staticText?: string;
  fieldKey?: string;            // ✅ 保留（内部存储用），工具栏不显示
  style: CellStyle;
}

export interface CellStyle {
  align: CellAlign;
  bold?: boolean;
  fontSize?: number;
  bg?: string;      // 背景色
  color?: string;   // 字体颜色 ✅ 新增
}
```

---

## 三、布局重构

### 变更前

```
┌──────────────┬──────────┐
│              │ Field    │
│  FormGrid    │ Inspector│
│  Editor      │ (右侧)   │
│              │          │
└──────────────┴──────────┘
```

### 变更后

```
┌──────────────────────────────────────────────────────────────┐
│  [编辑]  [开始]                                               │
├──────────────────────────────────────────────────────────────┤
│  编辑模式: [撤销][重做][保存][导入Excel][导出][发布]           │
│                                                              │
│  开始模式:                                                    │
│  ┌──────────┬──────┬───────────┬────────────────────────────┐ │
│  │格子类型   │字段   │选项编辑区  │ [B] [字号▾] [≡左][≡中][≡右]│ │
│  │◉静态文本  │类型▾  │(条件显示)  │ [🪣背景色▾] [A字体色▾]    │ │
│  │◉填报字段  │      │           │                            │ │
│  └──────────┴──────┴───────────┴────────────────────────────┘ │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                   FormGridEditor (全宽)                       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

- **移除**：右侧 FieldInspector 面板
- **移除**：必填 checkbox、字段 Key 输入框、colSpan/rowSpan 手动输入、`<input type="color">`
- **新增**：顶部双标签（编辑/开始）、油漆桶色块面板、字体颜色色块面板、字号选择器、工具栏对齐按钮

---

## 四、色块面板设计

### 4.1 背景色（油漆桶）面板

```
┌──────────────────────┐
│ 主题色               │
│ [■][■][■][■][■]      │  ← app-color 令牌色块
│ [■][■][■][■][■]      │
│ 无填充               │  ← 透明/移除背景色
└──────────────────────┘
```

内置色块（10个）：`transparent`, `#FAD4C0`(暖桃), `#80A1C1`(钢蓝), `#E8F5E9`(浅绿), `#FFF3E0`(浅橙), `#FCE4EC`(浅粉), `#E3F2FD`(浅蓝), `#F3E5F5`(浅紫), `#FFFFFF`(白), `#F5F5F5`(浅灰)

### 4.2 字体颜色面板

```
┌──────────────────────┐
│ 主题色               │
│ [A][A][A][A][A]      │
│ [A][A][A][A][A]      │
│ 自动                 │
└──────────────────────┘
```

内置色块（10个）：`inherit`, `#1a1a1a`(黑), `#666666`(深灰), `#999999`(灰), `#FAD4C0`(暖桃), `#80A1C1`(钢蓝), `#e03131`(红), `#2f9e44`(绿), `#1971c2`(蓝), `#f08c00`(橙)

### 4.3 实现方式

- **不用** `<input type="color">`（浏览器原生取色器渲染卡）
- **用** 纯 div 色块 + 点击选择，`useState` 管理展开/收起
- 自定义颜色通过一个文本输入框输入 hex 值（如 `#FF0000`）
- 面板点击外部自动关闭

---

## 五、选项编辑器重构

### 变更前

```
┌────────────────────┐
│ 选项（每行一个）    │
│ ┌────────────────┐ │
│ │ A              │ │  ← 一个 textarea，label=value
│ │ B              │ │
│ │ C              │ │
│ └────────────────┘ │
└────────────────────┘
```

### 变更后

```
┌──────────────────────────────┐
│ 选项编辑                  [+] │
│ ┌──────────┬──────────┬────┐ │
│ │ 显示名    │ 值        │ ≡ ⋮│ │  ← 每行独立 label/value + 拖拽排序
│ ├──────────┼──────────┼────┤ │
│ │ 选项A    │ option_a  │ 🗑 │ │
│ │ 选项B    │ option_b  │ 🗑 │ │
│ │ 选项C    │ option_c  │ 🗑 │ │
│ └──────────┴──────────┴────┘ │
│                              │
│ 引用选项集: [未关联 ▾]       │  ← 打通 OptionSetManager
│ [存为选项集模板]              │
└──────────────────────────────┘
```

- 每行独立 label / value 输入框
- 拖拽手柄排序
- 删除按钮
- 顶部 [+] 添加行
- 下拉关联 OptionSet → 选中后自动填充
- "存为选项集模板"按钮

---

## 六、编辑器字段类型预览

在 `FormGridEditor.tsx` 新增 `renderFieldTypePreview(field, cell)` 函数：

| 类型 | 预览渲染 |
|------|---------|
| TEXT | `[Aa] {field.label}` |
| NUMBER | `[123] {field.label}` |
| BOOLEAN | 禁用的 `<input type="checkbox">` + label |
| SELECT | 禁用的 `<select>`，显示第一个选项或"—请选择—" |
| MULTI_SELECT | 禁用 checkbox 组（前3个选项） |
| DATETIME | `[📅] {field.label}` |
| IMAGE | 虚线边框 + 图片图标 + label |
| FILE | 虚线边框 + 上传图标 + label |
| USER | `[👤] {field.label}` |
| AUTO_USER | `[🕒 自动] {field.label}`（灰色斜体） |

---

## 七、任务分解

### Phase A: 类型系统变更 (FE 先行)

| # | 任务 | 文件 | 说明 | 状态 |
|---|------|------|------|------|
| A1 | types.ts 更新 | `types.ts` | 新增 AUTO_USER，CellStyle.color | ✅ 完成 |
| A2 | FIELD_TYPES 常量更新 | `EditorToolbar.tsx` 内联 | 增加"自动记录"类型选项 | ✅ 完成 (内嵌于 B1) |

### Phase B: 工具栏重构

| # | 任务 | 文件 | 说明 | 状态 |
|---|------|------|------|------|
| B1 | 创建 EditorToolbar 组件 | 新建 `EditorToolbar.tsx` | 双标签页（编辑/开始），编辑=文件操作，开始=属性编辑 | ✅ 完成 |
| B2 | 创建 ColorPalette 组件 | 新建 `ColorPalette.tsx` | 背景色/字体色共用色块面板，内置10色+自定义hex输入 | ✅ 完成 |
| B3 | 创建 OptionEditor 组件 | 新建 `OptionEditor.tsx` | 逐条编辑 label/value + 拖拽排序 + 关联OptionSet | ✅ 完成 |
| B4 | 重构 ReportFormDesignPage | `ReportFormDesignPage.tsx` | 工具栏在上，编辑器在下全宽，移除右侧面板 | ✅ 完成 |
| B5 | 移除 FieldInspector 中的冗余项 | `FieldInspector.tsx` | FieldInspector 已从设计页解耦，工具栏替代其全部功能 | ✅ 完成 |

### Phase C: 编辑器预览

| # | 任务 | 文件 | 说明 | 状态 |
|---|------|------|------|------|
| C1 | renderFieldTypePreview | `FormGridEditor.tsx` | 按类型渲染预览控件（10种类型各不同） | ✅ 完成 |
| C2 | 对齐/颜色样式统一 | `FormGridEditor.tsx` | 静态/字段共用 style.align + style.color | ✅ 完成 |

### Phase D: 写入端适配

| # | 任务 | 文件 | 说明 | 状态 |
|---|------|------|------|------|
| D1 | FormGridRenderer 支持 AUTO_USER | `FormGridRenderer.tsx` | 自动填入用户名+时间，不可编辑 | ✅ 完成 |
| D2 | 后端 FieldValidator 适配 | `FieldValidator.java` | 新增 AUTO_USER 校验（跳过，自动注入） | ✅ 完成 |
| D3 | ReportFillService 自动注入 | `ReportFillService.java` | AUTO_USER 字段保存时自动注入用户ID+时间戳 | ✅ 完成 |

### Phase E: OptionSet 集成

| # | 任务 | 文件 | 说明 | 状态 |
|---|------|------|------|------|
| E1 | OptionEditor 关联 OptionSet | `OptionEditor.tsx` | 下拉选择+自动填充+存为模板按钮 | ✅ 完成 |
| E2 | FieldDefinition.optionSetId 生效 | `FormGridRenderer.tsx` | 填写端从 OptionSet 加载 options | 🔜 后续迭代 |

### Phase F: 复核验证

| # | 任务 | 说明 | 状态 |
|---|------|------|------|
| F1 | 硬编码颜色检查 | grep 零违规 | ✅ 通过 |
| F2 | 裸 z-index 检查 | 全部使用 var(--z-*) | ✅ 通过 |
| F3 | TypeScript 编译 | npx tsc --noEmit 零错误 | ✅ 通过 |
| F4 | 全类型预览覆盖 | 10种类型各有独立预览渲染 | ✅ 通过 |

---

## 八、涉及文件清单

| 文件 | 操作 | Phase |
|------|------|-------|
| `frontend/src/features/report-form/types.ts` | 修改 | A |
| `frontend/src/features/report-form/components/EditorToolbar.tsx` | **新建** | B |
| `frontend/src/features/report-form/components/ColorPalette.tsx` | **新建** | B |
| `frontend/src/features/report-form/components/OptionEditor.tsx` | **新建** | B |
| `frontend/src/features/report-form/components/FormGridEditor.tsx` | 修改 | C |
| `frontend/src/features/report-form/components/FormGridRenderer.tsx` | 修改 | D |
| `frontend/src/features/report-form/components/FieldInspector.tsx` | 修改/删除 | B |
| `frontend/src/features/report-form/pages/ReportFormDesignPage.tsx` | 修改 | B |
| `frontend/src/features/report-form/hooks/useFormGridEditor.ts` | 修改 | C |
| `src/main/java/.../reportform/service/ReportFillService.java` | 修改 | D |
| `src/main/java/.../reportform/service/FieldValidator.java` | 修改 | D |

---

## 九、执行顺序

```
A1 → A2 → B1 → B2 → B3 → B4 → B5 → C1 → C2 → D1 → D2 → E1 → E2 → F1→F2→F3→F4→F5→F6
```

**B1/B2/B3 可并行开发**（三个独立组件）。
C 依赖 B（工具栏组件已就绪）。
D/E 依赖 A（类型定义已更新）。

---

## 十、不向后兼容的风险点

- `required` 字段从 `FieldDefinition` 移除 → 已有 `layoutJson` 中的 `required: true` 会被忽略（无副作用）
- `CellStyle.color` 新增 → 已有数据无此字段，默认 `undefined`（取继承色）
- `AUTO_USER` 类型 → 已有数据无此类型，无影响
