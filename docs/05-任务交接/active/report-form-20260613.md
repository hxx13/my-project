# 填报报表新模块 — Phase 1 完成

## 状态：Phase 2/6 待开始

**创建**: 2026-06-13 · **最后更新**: 2026-06-13

---

## Phase 0 完成清单

| # | 任务 | 状态 |
|---|------|------|
| 0.1 | `report_form_*` 4 表 DDL + bootstrap | ✅ |
| 0.2 | `modules/reportform/` 包骨架 (2C+2S+3M+3E) | ✅ |
| 0.3 | PagePermission 双入口种子 | ✅ |
| 0.4 | `features/report-form/` types + API 骨架 | ✅ |
| 0.5 | 路由注册 + 5 页骨架 | ✅ |
| 0.6 | adminNavRegistry 双导航 | ✅ |
| 0.7 | 移除旧 smartsheet 路由+导航 | ✅ |

## 关键上下文

1. **模块零耦合**：新模块完全不引用 `features/smartsheet` 或 `modules/smartsheet`。API 前缀 `/api/admin/report-form` 和 `/api/admin/report-fill`。

2. **FE API 使用 `adminHttp`**（`@/api/core/adminHttp`），baseURL = `/api/admin`，所以路径不需要 `/api/admin` 前缀（如 `/report-form/forms/page`）。

3. **BE 使用 `TwinBusinessException.of(ErrorCodeConstants.NOT_FOUND, ...)`** 抛出异常，Controller 使用 `Result.success()` / `Result.error()`。

4. **所有 UI 代码使用 `var(--app-color-*)` 令牌**，禁止硬编码颜色。所有 z-index 使用 `var(--z-*)`。

5. **旧 smartsheet 代码文件未删除**（仅移除了路由+导航引用），Phase 6 再删。

## Phase 1 完成清单

| # | 任务 | 状态 |
|---|------|------|
| 1.1 | POI Excel 导入解析（合并单元格 → layout_json） | ✅ |
| 1.2 | FormGridEditor（HTML table 渲染 + 选格 + 拖选 + Undo/Redo） | ✅ |
| 1.3 | GridContextMenu（右键：插行/列、合并/拆分、删除） | ✅ |
| 1.4 | FieldInspector（属性面板：类型切换/配置/样式/合并） | ✅ |
| 1.5 | 格子切换 static↔field（内嵌于 FieldInspector） | ✅ |
| 1.6 | 保存草稿 PUT API + ReportFormDesignPage 全集成 + ExcelImportButton | ✅ |

### 关键上下文（新增）

- **Excel 导入**：`ReportFormImportService.importFromExcel()` 解析合并单元格，生成 `cells[]` 默认 `kind:static` + `align:center`
- **设计器**：左右分栏（7:3），FormGridEditor + FieldInspector
- **保存**：PUT `/api/admin/report-form/forms/{id}` 接受 `{ name, layoutJson }`，支持部分更新
- **useFormGridEditor**：管理 selection、undo/redo 栈（structuredClone）、cell/field/style 更新
- **`adminHttp` baseURL = `/api/admin`**，API 路径不需要 `/api/admin` 前缀

## 下一步：Phase 2

6 个任务：
- 2.1 选项集 CRUD + 管理页（全局 + 表单私有）
- 2.2 ThemePanel（7 项主题配置）
- 2.3 PermissionPanel（字段角色绑定）
- 2.4 PublishWizard（快速+分步）
- 2.5 publish/unpublish API + 版本快照
- 2.6 发布后编辑兼容

## 相关文档

- 规格: `docs/superpowers/specs/2026-06-13-report-form-design.md`
- 计划: `docs/superpowers/plans/2026-06-13-report-form-plan.md`
