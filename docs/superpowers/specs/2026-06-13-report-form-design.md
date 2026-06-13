# 填报报表新模块 — 架构设计 Spec

> 状态: ✅ 设计完成 · 下一阶段: writing-plans
> 创建: 2026-06-13 · 更新: 2026-06-13 · 作者: hxx13 + AI

---

## 1. 概述与上下文

### 1.1 产品定位

| 阶段 | 做什么 | 不做什么 |
|------|--------|----------|
| **发布前（设计）** | 从 Excel 自适应导入网格（含合并单元格）→ 在 HTML 表格上调节格子属性 → 配置权限 → 发布 | 在线 Excel、公式计算、外部数据绑定（Phase 5 后期） |
| **发布后（填报）** | 独立入口浏览已发布报表 → 按模式（协同/个人）填报 → 导出/打印 | 改表结构（发布后允许编辑但自动兼容已有数据） |
| **后期** | 数据绑定、学生端/小程序入口 | 本期不实现 |

### 1.2 核心设计原则

1. **格驱动模型**：不区分行列，整个网格是一组格子，每个格子有位置+跨度+内容+类型
2. **与旧 SmartSheet 零耦合**：新模块完全不引用旧代码，数据库独立，API 前缀独立
3. **发布=快照+锁定结构**：发布时产生版本快照；发布后可编辑结构但已有数据自动兼容
4. **提交≠锁定**：提交仅标记状态（已登记），永远可继续编辑
5. **合并单元格一等公民**：导入时解析 Excel 合并 → 编辑器中拖选合并/拆分

### 1.3 模块边界

```
新模块:
  前端: frontend/src/features/report-form/
  后端: src/main/java/com/example/demo/modules/reportform/
  数据库: report_form_* (4表)
  API前缀: /api/admin/report-form + /api/admin/report-fill
  路由: /admin/report-form + /admin/report-fill

旧模块 (Phase 6 删除):
  前端: features/smartsheet/
  后端: modules/smartsheet/
  数据库: smartsheet_*
  路由: /admin/smartsheet/*
```

---

## 2. 架构分层总览

### 2.1 数据流

```
[Excel .xlsx] ──导入──→ [report_form_definition.layout_json] ──渲染──→ [FormGridEditor 设计态]
                                                                              │
                                                                    ┌─ 保存草稿 ─┘
                                                                    │
                                                    [发布] ──→ status=published + 版本快照
                                                                    │
                              ┌─────────────────────────────────────┤
                              │                                     │
                     [协同模式]                               [个人模式]
                     一表一条记录                              每人一条记录
                     form_id 唯一                              (form_id, user_id) 唯一
                              │                                     │
                              └── [report_form_submission] ─────────┘
                                        │
                                  导出 Excel/PDF/Word
```

### 2.2 模块结构

```
modules/reportform/
  controller/
    ReportFormController.java       # /api/admin/report-form
    ReportFillController.java       # /api/admin/report-fill
  service/
    ReportFormService.java
    ReportFillService.java
    ReportFormImportService.java    # Excel 导入
    ReportFormExportService.java    # 导出 (Excel/PDF/Word)
  mapper/
    ReportFormDefinitionMapper.java
    ReportFormSubmissionMapper.java
    ReportFormOptionSetMapper.java
  entity/
    ReportFormDefinition.java
    ReportFormSubmission.java
    ReportFormOptionSet.java
  dto/
    (请求/响应 DTO)
  validator/
    FieldValidator.java             # 字段类型校验（独立实现，不引用 smartsheet）
```

---

## 3. 数据库变更

### 3.1 新表 DDL

**report_form_definition** — 模板主表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO_INCREMENT | |
| name | VARCHAR(255) NOT NULL | 报表名称 |
| description | VARCHAR(1000) | |
| status | VARCHAR(16) NOT NULL DEFAULT 'draft' | draft / published / archived |
| layout_json | MEDIUMTEXT | 网格 cells[] + fields{} |
| theme_json | MEDIUMTEXT | 表头/斑马纹/边框/字体/行列尺寸 |
| fill_policy_json | MEDIUMTEXT | mode + submitLabel + allowEditAfterSubmit |
| permission_json | MEDIUMTEXT | visibleRoles[] + fieldRoleBindings{} |
| schedule_json | MEDIUMTEXT | period(daily/weekly/monthly) + timeWindow |
| word_template_ids_json | JSON | 绑定的 Word 打印模板 ID 列表 |
| created_by | VARCHAR(64) | |
| updated_by | VARCHAR(64) | |
| published_by | VARCHAR(64) | |
| published_at | DATETIME | |
| created_at | DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE | |

**report_form_submission** — 填报记录

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO_INCREMENT | |
| form_id | BIGINT NOT NULL | FK → definition |
| user_id | BIGINT NOT NULL | 填写人 |
| status | VARCHAR(16) NOT NULL DEFAULT 'draft' | draft / submitted |
| field_values_json | MEDIUMTEXT | { fieldKey: value } |
| version | INT NOT NULL DEFAULT 0 | 乐观锁 |
| submitted_at | DATETIME | |
| created_at / updated_at | DATETIME | |
| UNIQUE KEY | (form_id, user_id) | 个人模式每人一条；协同模式 user_id=0 (SHARED)，全局唯一 |

**report_form_submission_log** — 提交日志

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO_INCREMENT | |
| submission_id | BIGINT NOT NULL | FK → submission |
| user_id | BIGINT NOT NULL | 操作人 |
| action | VARCHAR(16) NOT NULL | save / submit |
| field_values_snapshot_json | MEDIUMTEXT | 当时的数据快照 |
| created_at | DATETIME | |

**report_form_option_set** — 选项集（全局+表单私有）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT PK AUTO_INCREMENT | |
| name | VARCHAR(255) NOT NULL | 如"设备状态" |
| scope | VARCHAR(16) NOT NULL DEFAULT 'global' | global / form (form_id 非空) |
| form_id | BIGINT NULL | 表单私有选项集时关联 |
| items_json | MEDIUMTEXT | [{label, sortOrder}] |
| created_at / updated_at | DATETIME | |

### 3.2 Word 打印模板存储

Word 模板（.docx）文件存储复用现有 `file-templates` 服务。绑定关系存在 `report_form_definition.word_template_ids_json` 中，格式：

```json
[ { "id": "ft_001", "name": "带章版巡检报告", "bookmarkMapping": { "table_start": "TABLE_PLACEHOLDER", "f_temp": "TEMP_VALUE", "f_note": "NOTE_VALUE" } } ]
```

导入 Word 时解析书签 → 用户手动将书签映射到 fieldKey → 保存绑定关系。

### 3.3 版本快照（同表内联，不另建表）

`report_form_definition` 增加 `version_snapshots_json` 字段（MEDIUMTEXT），每次发布时追加一条：

```json
[
  { "version": 1, "publishedAt": "...", "publishedBy": "...",
    "snapshot": { "layout_json": {...}, "theme_json": {...}, "permission_json": {...} }
  }
]
```

不需要回滚功能，仅供查看历史。

### 3.3 模板共享

已发布的表单可"另存为模板"，写入 `report_form_template` 表（结构同 definition 但 `is_template=1`，`shared=1` 表示共享给组织内其他人）。

---

## 4. 后端 API 契约

### 4.1 ReportFormController @ `/api/admin/report-form`

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/forms/page` | ADMIN | 管理列表（draft+published+archived），分页+搜索 |
| POST | `/forms/from-excel` | ADMIN | 上传 Excel → 解析合并单元格 → 创建 draft → 返回 layout_json |
| POST | `/forms/blank` | ADMIN | 创建空白网格（默认 5 行 × 5 列）→ draft |
| POST | `/forms/from-template/{templateId}` | ADMIN | 从模板创建 |
| GET | `/forms/{id}` | ADMIN | 详情（设计器用，含 layout/theme/permission） |
| PUT | `/forms/{id}` | ADMIN | 更新 layout/theme/permission/schedule（仅 draft） |
| POST | `/forms/{id}/publish` | ADMIN | 发布 + 固化结构 + 版本快照 |
| POST | `/forms/{id}/unpublish` | ADMIN | 撤回 → draft |
| DELETE | `/forms/{id}` | ADMIN | 删除（draft/archived） |
| POST | `/forms/{id}/archive` | ADMIN | 归档 |
| POST | `/forms/{id}/save-as-template` | ADMIN | 另存为模板 |
| GET | `/templates` | ADMIN | 模板列表（我的+共享的） |
| DELETE | `/templates/{id}` | ADMIN | 删除我的模板 |
| GET | `/option-sets` | ADMIN | 选项集列表（全局+指定表单私有） |
| POST | `/option-sets` | ADMIN | 创建选项集 |
| PUT | `/option-sets/{id}` | ADMIN | 编辑选项集 |
| DELETE | `/option-sets/{id}` | ADMIN | 删除选项集 |
| POST | `/forms/{id}/word-templates` | ADMIN | 绑定 Word 打印模板 |
| GET | `/forms/{id}/word-templates` | ADMIN | 查看已绑定的 Word 模板列表 |
| DELETE | `/forms/{id}/word-templates/{wtId}` | ADMIN | 解绑 Word 模板 |

### 4.2 ReportFillController @ `/api/admin/report-fill`

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/available` | STAFF+ | 当前用户可见的已发布报表（按报表聚合） |
| GET | `/forms/{id}` | STAFF+ | 填报用定义（含权限过滤 fields） |
| GET | `/forms/{id}/submissions` | ADMIN | 所有提交列表（个人模式：按人分页） |
| GET | `/forms/{id}/my-submission` | STAFF+ | 当前用户的填报记录 |
| PUT | `/forms/{id}/my-submission` | STAFF+ | 保存草稿（字段校验+版本乐观锁） |
| POST | `/forms/{id}/my-submission/submit` | STAFF+ | 提交标记（required 字段校验） |
| GET | `/forms/{id}/export` | STAFF+ | 单条导出 Excel |
| GET | `/forms/{id}/export-batch` | ADMIN | 批量导出 Excel（按日期/人筛选） |
| GET | `/forms/{id}/export-pdf` | STAFF+ | 单条导出 PDF |
| GET | `/forms/{id}/export-word/{wtId}` | STAFF+ | Word 模板注入导出 |

### 4.3 通用约定

- 所有响应：`Result<T>` 包装 `{ code, msg, data }`
- 异常：`throw new TwinBusinessException(ErrorCodeConstants.XXX)`
- 权限：Controller 层调用 `authContextService.getCurrentUserRole()` + `permission_json` 过滤
- 校验：`FieldValidator` 按字段 type 独立校验，不引用 smartsheet 包
- 导出：Apache POI 实现，代码放 `reportform` 包内

---

## 5. 前端组件接口契约

### 5.1 目录结构

```
features/report-form/
  pages/
    ReportFormListPage.tsx         # 管理列表
    ReportFormDesignPage.tsx       # 设计器
    ReportFillHubPage.tsx          # 填报中心列表
    ReportFillPage.tsx             # 单表填报
    SubmissionManagePage.tsx       # ADMIN 查看所有提交
  components/
    FormGridEditor.tsx             # 设计态网格编辑器
    FormGridRenderer.tsx           # 发布态渲染器
    FieldInspector.tsx             # 属性面板
    ThemePanel.tsx                 # 主题配置
    PermissionPanel.tsx            # 权限配置（字段角色绑定）
    PublishWizard.tsx              # 发布向导（快速+分步）
    ExcelImportButton.tsx          # Excel 导入按钮
    WordTemplateManager.tsx        # Word 模板管理
  hooks/
    useReportFormData.ts
    useReportFormMutation.ts
    useReportFill.ts
  types.ts
  api/reportForm.api.ts
  api/reportFill.api.ts
```

### 5.2 核心 Types

```typescript
// layout_json 的 TS 类型
interface GridCell {
  id: string;
  row: number; col: number;
  colSpan: number; rowSpan: number;
  kind: 'static' | 'field';
  staticText?: string;
  fieldKey?: string;
  style: CellStyle;
}

interface CellStyle {
  align: 'left' | 'center' | 'right';  // 默认 center
  bold?: boolean;
  fontSize?: number;
  bg?: string;                          // CSS 颜色值
  color?: string;
}

interface FieldDefinition {
  type: FieldType;
  label: string;
  required?: boolean;
  editableInFill?: boolean;
  editableByRoles?: string[];          // 空数组 = 所有人可填
  maxLength?: number;                  // TEXT
  min?: number; max?: number; step?: number; // NUMBER
  options?: { label: string; value: string }[];
  optionSetId?: string;                // SELECT/MULTI_SELECT 引用全局选项集
  props?: Record<string, unknown>;     // 扩展属性
}

type FieldType = 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'SELECT' | 'MULTI_SELECT'
  | 'DATETIME' | 'IMAGE' | 'FILE' | 'USER';
```

### 5.3 FormGridEditor 组件契约

- **输入 Props**: `layout: LayoutJson`, `onChange: (layout) => void`
- **行为**:
  - 单击格子 → 属性面板选中（显示勾选标记）
  - Shift+单击或拖拽 → 多选（用于批量合并）
  - 拖拽列头/行头边缘 → 调整列宽/行高（实时更新 `theme_json`）
  - 右键菜单 → 上方/下方插入行、左侧/右侧插入列、合并选中、拆分
  - 选中格子的 type 切换 `static ↔ field`
- **状态管理**: hook `useFormGridEditor` 管理 selection、clipboard、undo/redo 栈

### 5.4 FormGridRenderer 组件契约

- **输入 Props**: `layout: LayoutJson`, `values: FieldValues`, `editable: boolean`, `onChange?: (key, value) => void`
- **行为**:
  - `kind: static` → 只读渲染 staticText
  - `kind: field` 且 `editableInFill` + 角色匹配 → 渲染对应控件
  - `kind: field` 但角色不匹配 → 只读显示值
- **字段控件映射**:
  - TEXT → `<input type="text">`
  - NUMBER → `<input type="number">` (含 min/max/step)
  - BOOLEAN → checkbox
  - SELECT → `<select>` 下拉单选
  - MULTI_SELECT → 多选下拉组件
  - DATETIME → 日期时间选择器 (input[type=datetime-local])
  - IMAGE → URL 输入 + 上传按钮 + 行内缩略图预览
  - FILE → 文件上传按钮 + 已上传文件链接（PDF 可在线预览）+ 下载链接
  - USER → 人员搜索选择器

### 5.5 FieldInspector 属性面板

- **静态格**: 文案 textarea、对齐方式 radio、背景色 color picker、colSpan/rowSpan 数字输入
- **字段格**: fieldKey 输入、类型 dropdown、选项配置（内联编辑或引用选项集）、必填 checkbox、可填角色多选（提示：空=所有人可填）、FIELD/FILE 的 props 配置

### 5.6 填报页核心循环（参考 DailyInspectionPanel）

```
1. Fetch-or-Create: 打开页面 → GET /forms/{id}/my-submission
   → 有则加载 field_values + 合并到 FormGridRenderer
   → 无则创建空记录
2. Debounce 自动保存: 任何字段修改 → 600ms 防抖 → PUT my-submission
3. 周期性同步（协同模式）: setInterval 5s → GET my-submission → 就地合并
4. 就地合并: 保存/同步返回的 submission → setState 更新本地值
   （不刷新整页，不重新加载 definition）
5. 提交: 手动点击 → POST submit → 标记 status=submitted → 仍可继续编辑
6. 版本乐观锁: PUT 携带 version → 后端校验 → 冲突则提示用户刷新
```

---

## 6. 安全设计

### 6.1 认证

- 所有 API 通过现有 Bearer Token 鉴权（复用 `AuthContextService`）
- 学生端/小程序（后期）复用同一 API，加 `STUDENT` 角色与权限即可

### 6.2 鉴权

| 层级 | 检查内容 |
|------|---------|
| Controller | `authContextService.getCurrentUserRole()` 验证 |
| 填报列表 | `permission_json.visibleRoles` 过滤（用户角色不在列表中则不显示） |
| 字段级 | `fields[].editableByRoles[]` — 空数组=所有人可填，非空只允许列表内角色编辑 |
| 未绑定角色 | `allowUnboundView: true` 时不可编辑但可查看 |

### 6.3 数据校验

- `FieldValidator` 按类型独立实现：
  - NUMBER 范围校验 (min/max)
  - TEXT 长度校验 (maxLength)
  - SELECT 选项合法性
  - IMAGE URL 格式校验
  - FILE 大小校验 (maxSizeMB)
- SQL 注入防护：所有 SQL 使用 `#{}` 参数绑定
- 导出后台参数校验：日期范围、用户 ID 合法性

### 6.4 并发控制

- 版本乐观锁：`submission.version` 字段
- 保存时 PUT 携带 `expectedVersion` → 后端 `UPDATE ... WHERE version = #{expectedVersion}` → 行数为 0 则冲突

---

## 7. 路由与导航

### 7.1 路由注册

| 路由 | 页面 | 权限守卫 |
|------|------|---------|
| `/admin/report-form` | ReportFormListPage | AdminAccessGuard → ADMIN |
| `/admin/report-form/:id/design` | ReportFormDesignPage | ADMIN |
| `/admin/report-form/:id/submissions` | SubmissionManagePage | ADMIN |
| `/admin/report-fill` | ReportFillHubPage | STAFF+ |
| `/admin/report-fill/:id` | ReportFillPage | STAFF+ |

### 7.2 导航注册（adminNavRegistry）

| id | path | label | icon | fallbackMinRole | 归属分组 |
|----|------|-------|------|-----------------|---------|
| report-form | /admin/report-form | 填报报表管理 | Table2 | ADMIN | 资产与运维 |
| report-fill | /admin/report-fill | 填报中心 | ClipboardCheck | STAFF | 资产与运维 |

### 7.3 页面权限种子（PagePermissionSchemaMigrator）

两个新 ENTRY 的 `INSERT IGNORE` 种子，与现有模式一致。

### 7.4 壳层返回逻辑

- 设计器 → 回退到 `/admin/report-form`（列表）
- 填报页 → 回退到 `/admin/report-fill`（填报中心）
- 提交管理页 → 回退到 `/admin/report-form`

---

## 8. 数据对接清单

| API | 调用方 | 说明 |
|-----|--------|------|
| `GET /api/admin/report-form/forms/page` | ReportFormListPage | 管理列表 |
| `POST /api/admin/report-form/forms/from-excel` | ExcelImportButton | 导入创建 |
| `GET/PUT /api/admin/report-form/forms/{id}` | ReportFormDesignPage | 设计器加载/保存 |
| `POST /api/admin/report-form/forms/{id}/publish` | PublishWizard | 发布 |
| `POST /api/admin/report-form/forms/{id}/save-as-template` | ReportFormListPage | 另存模板 |
| `GET /api/admin/report-fill/available` | ReportFillHubPage | 填报中心列表 |
| `GET /api/admin/report-fill/forms/{id}/my-submission` | ReportFillPage | 加载填报记录 |
| `PUT /api/admin/report-fill/forms/{id}/my-submission` | ReportFillPage (auto-save) | 草稿保存 |
| `POST /api/admin/report-fill/forms/{id}/my-submission/submit` | ReportFillPage | 标记提交 |
| `GET /api/admin/report-fill/forms/{id}/submissions` | SubmissionManagePage | 所有提交 |
| `GET /api/admin/report-fill/forms/{id}/export*` | ReportFillPage/SubmissionManagePage | 各种导出 |
| FILE 字段上传 | 复用 `/api/admin/file-templates` 接口 | 文件存储联动 |
| 远程打印（后期） | IPP/CUPS 协议接口 | Phase 4 预留 |

---

## 9. 可复用模块清单

| 模块 | 路径 | 复用方式 |
|------|------|---------|
| AdminPageShell | `@/components/admin/AdminPageShell` | 列表页/设计器壳 |
| AdminButton | `@/components/admin/AdminButton` | 按钮统一 |
| AdminSelect | `@/components/admin/AdminSelect` | 下拉统一 |
| AdminFormCard | `@/components/admin/AdminPageShell` | 表单卡片 |
| Portal | `@/components/Portal` | 弹窗/Modal |
| AuthContextService | `modules/auth/` | 角色校验 |
| PagePermission 体系 | `modules/pagepermission/` | 种子+权限过滤 |
| File Templates 接口 | `/api/admin/file-templates` | FILE 类型上传联动 |
| Apache POI | 后端依赖 | 导入/导出 |
| 定时任务框架 | 现有 ScheduleManager | 周期生成调度 |
| `adminShellNavigation` | `@/features/admin/adminShellNavigation` | 壳层返回逻辑 |

**不引用**: `features/smartsheet` 的任何组件/hook/API、`modules/smartsheet` 的任何 Service/Mapper/Validator。

---

## 10. 新增文件清单

### 新建文件

**前端 (25 个)**:
```
frontend/src/features/report-form/
  types.ts
  api/reportForm.api.ts
  api/reportFill.api.ts
  hooks/useReportFormData.ts
  hooks/useReportFormMutation.ts
  hooks/useReportFill.ts
  components/FormGridEditor.tsx
  components/FormGridRenderer.tsx
  components/FieldInspector.tsx
  components/ThemePanel.tsx
  components/PermissionPanel.tsx
  components/PublishWizard.tsx
  components/ExcelImportButton.tsx
  components/WordTemplateManager.tsx
  components/OptionSetManager.tsx
  components/SubmissionTableView.tsx
  components/SubmissionDetailView.tsx
  pages/ReportFormListPage.tsx
  pages/ReportFormDesignPage.tsx
  pages/ReportFillHubPage.tsx
  pages/ReportFillPage.tsx
  pages/SubmissionManagePage.tsx
```

**后端 (18+ 个)**:
```
src/main/java/com/example/demo/modules/reportform/
  controller/ReportFormController.java
  controller/ReportFillController.java
  service/ReportFormService.java
  service/ReportFillService.java
  service/ReportFormImportService.java
  service/ReportFormExportService.java
  mapper/ReportFormDefinitionMapper.java
  mapper/ReportFormSubmissionMapper.java
  mapper/ReportFormOptionSetMapper.java
  entity/ReportFormDefinition.java
  entity/ReportFormSubmission.java
  entity/ReportFormOptionSet.java
  dto/*.java (请求/响应 DTO)
  validator/FieldValidator.java
```

**数据库 (1 个)**:
```
common/schema/V20260613__report_form_tables.sql
```

### 修改文件

- `frontend/src/router/index.tsx` — 添加/替换路由
- `frontend/src/features/admin/adminNavRegistry.ts` — 添加双导航条目
- `src/main/java/.../PagePermissionSchemaMigrator.java` — 种子双入口

### 删除文件（Phase 6）

- `frontend/src/features/smartsheet/` — 全部删除
- `frontend/src/api/domains/smartsheet.api.ts` — 删除
- `src/main/java/.../modules/smartsheet/` — 全部删除
- `src/main/resources/mapper/smartsheet/` — 全部删除
- 旧路由条目、旧 nav 条目、旧权限种子

---

## 11. 导入变更

- 新模块不 import 任何 `smartsheet` 路径的代码
- 旧 `smartsheet` 入口从路由+导航中移除（Phase 0.7），Phase 6 删文件
- FILE 字段上传复用现有 `file-templates` API，不新建文件存储服务

---

## 12. 边缘情况与错误处理

| # | 场景 | 处理方式 |
|---|------|---------|
| 1 | Excel 为空 | 返回空 cells[]，提示"Excel 无有效数据" |
| 2 | Excel 中合并单元格跨行跨列 | POI 解析 → colSpan/rowSpan 正确映射到 cells |
| 3 | 并发编辑同一 submission | 版本号冲突 → 409 错误 → 提示"数据已被他人修改，请刷新" |
| 4 | 时间窗口外提交 | 400 错误 → "当前不在填报时间窗口内" |
| 5 | 权限不足访问表单 | 403 → 填报列表不显示此表单 |
| 6 | 必填字段为空时提交 | 400 → 列出所有未填的必填字段 |
| 7 | 发布后修改结构 | 允许 PUT（不再锁定），新增格子 data 为空，删除格子 data 保留但不再渲染 |
| 8 | Word 模板书签不匹配 | 导入时校验书签名 → 不匹配的书签列表提示用户 |
| 9 | 文件上传超大 | 前端+后端双重校验 maxSizeMB → 413/400 |
| 10 | 网络断开时自动保存失败 | toast 提示，保存失败不覆盖本地数据，网络恢复后重试 |
| 11 | 周期调度创建失败 | 日志 WARN，下次调度重试 |
| 12 | 选项集被删除但字段仍引用 | 选项集删除时检查引用 → 有引用则提示不可删，需先解绑 |

---

## 13. 约束与原则

### 明确不做

1. **不解析 Excel 公式** — 只取展示值和格式，公式忽略
2. **不回滚历史版本** — 版本快照仅供查看，不支持恢复
3. **不做 cell 级 change_log** — 留痕粒度到 submission 级，不记录每次单格修改
4. **不引入外部数据绑定** — Phase 5 后期处理
5. **不做公式计算引擎** — 不在格子内做跨格计算/求和/引用
6. **不迁移旧 smartsheet 数据** — 新模块从零开始，旧数据随旧模块删除
7. **不引用 smartsheet 包的任何代码** — API/组件/hook/Service/Mapper 全部独立

### 必须遵守

1. 所有 UI 颜色/间距/z-index 使用 `--app-*` 语义令牌 + `var(--z-*)`
2. 所有 SQL 使用 `#{}` 参数绑定
3. 所有 API 响应统一 `Result<T>` 包装
4. 所有异常通过 `TwinBusinessException` + `ErrorCodeConstants` 抛出
5. 填报页保存策略：就地合并，禁止整表 reload

---

## 14. 错误码定义

在 `ErrorCodeConstants.java` 中新增（规划枚举，实现时精确分配数字）：

| code | msg | HTTP | 触发场景 |
|------|-----|------|---------|
| REPORT_FORM_NOT_FOUND | 报表不存在 | 404 | GET/PUT 不存在的表单 |
| REPORT_FORM_NOT_PUBLISHED | 报表未发布 | 400 | 填报表单尚未发布 |
| REPORT_FORM_VERSION_CONFLICT | 数据冲突，请刷新后重试 | 409 | 乐观锁版本不匹配 |
| REPORT_FORM_OUT_OF_WINDOW | 不在填报时间窗口内 | 400 | 时间窗口校验 |
| REPORT_FORM_FIELD_REQUIRED | 必填字段未填写 | 400 | 提交时 required 校验失败 |
| REPORT_FORM_FIELD_INVALID | 字段值格式不正确 | 400 | 类型/范围校验失败 |
| REPORT_FORM_NO_PERMISSION | 无权限访问此报表 | 403 | visibleRoles 校验失败 |
| REPORT_FORM_FIELD_NO_PERMISSION | 无权限编辑此字段 | 403 | editableByRoles 校验失败 |
| REPORT_FORM_OPTION_SET_IN_USE | 选项集被引用，不可删除 | 400 | 删除被引用的选项集 |
| REPORT_FORM_WORD_TEMPLATE_NOT_FOUND | Word模板不存在 | 404 | 绑定的模板已删除 |

---

## 15. 测试边界

| 层 | 测什么 | 不测什么 | 工具 |
|----|--------|---------|------|
| Mapper | SQL 正确性、参数绑定、分页 | 业务逻辑 | JUnit + H2 |
| Service | 业务规则（权限/校验/周期/窗口）、异常路径 8 种 | SQL 本身 | JUnit + Mock |
| Controller | 参数校验、权限拦截、响应格式 | Service 内部 | MockMvc |
| 前端组件 | FormGridRenderer 控件映射、FormGridEditor 选格拖拽、自动保存防抖 | 跨浏览器兼容 | Vitest + Testing Library |
| 导出 | Excel/PDF/Word 内容正确性 | 样式精确像素 | 文件 diff 比对 |

**不测**: 并发压力测试（不属于 MVP）、手机端兼容（后期）、小程序端（后期）

---

## 16. 日志与可观测性

日志前缀: `[report-form]`

| 事件 | 级别 | 日志内容 |
|------|------|---------|
| Excel 导入成功 | INFO | `[report-form] Excel 导入完成，cells={N}, fields={M}` |
| Excel 导入失败 | WARN | `[report-form] Excel 解析失败: {msg}` |
| 表单发布 | INFO | `[report-form] 报表 {id}:{name} 已发布 by {user}` |
| 表单撤回 | WARN | `[report-form] 报表 {id}:{name} 已撤回 by {user}` |
| 保存冲突 | WARN | `[report-form] 保存冲突 form={id} user={uid} version={v}` |
| 周期调度 | INFO | `[report-form] 周期调度完成 form={id} period={type}` |
| 导出 | INFO | `[report-form] 导出 form={id} type={excel/pdf/word} by {user}` |
| 字段校验失败 | INFO | `[report-form] 字段校验失败 form={id} field={key}` |

---

## 17. Z 轴层级

| 层级 | z-index | 组件 |
|------|---------|------|
| 设计器右键菜单 | `var(--z-dropdown)` (200) | 行列右键菜单 |
| 属性面板 | 无需特殊 z-index（inline 布局） | FieldInspector |
| 发布向导弹窗 | `var(--z-modal)` (800) | PublishWizard |
| 选项集管理弹窗 | `var(--z-modal)` (800) | OptionSetManager |
| Toast 通知 | `var(--z-toast)` (900) | react-hot-toast |
| 确认对话框 | `var(--z-modal)` (800) | confirm() |

---

## 18. 清理清单

### Phase 6 删除项

| 类别 | 路径/条目 |
|------|---------|
| 前端文件夹 | `frontend/src/features/smartsheet/` |
| 前端 API | `frontend/src/api/domains/smartsheet.api.ts` |
| 后端包 | `src/main/java/com/example/demo/modules/smartsheet/` |
| Mapper XML | `src/main/resources/mapper/smartsheet/` |
| 路由 | Router 中 4 条 smartsheet 路由 |
| 导航 | adminNavRegistry 中 smartsheet 条目 + `inferHomeSectionTitleForUnknownPath` 中 smartsheet 分支 |
| 权限种子 | PagePermissionSchemaMigrator 中 smartsheet ENTRY 种子 |
| 数据库表 | `smartsheet_*` 表（确认无依赖后 DROP） |
| Bootstrap | EmbeddedTwinSystemCoreDdlBootstrap 中 smartsheet 相关片段 |

### 保留不做

- 不保留旧数据迁移脚本
- 不保留向后兼容路由重定向
- 不保留旧 API `/api/admin/smartsheet`（新模块稳定后直接删）

---

## 19. 实施计划进程表

共 6 个 Phase，34 项任务。每完成一项标记 ✅。

### Phase 0 — 脚手架

| # | 任务 | 状态 |
|---|------|------|
| 0.1 | 创建 `report_form_*` 4 表 DDL + schema.sql + bootstrap | ⬜ |
| 0.2 | 创建 `modules/reportform/` 包骨架 | ⬜ |
| 0.3 | PagePermission 种子：双入口 | ⬜ |
| 0.4 | 创建 `features/report-form/` 目录 + types | ⬜ |
| 0.5 | 路由注册（6 条路由） | ⬜ |
| 0.6 | adminNavRegistry 添加双导航 | ⬜ |
| 0.7 | 移除旧 smartsheet 导航+路由 | ⬜ |

### Phase 1 — Excel 导入 + 设计器

| # | 任务 | 状态 |
|---|------|------|
| 1.1 | POI 导入：合并单元格 → cells[]，kind=static，align=center | ⬜ |
| 1.2 | FormGridEditor：HTML table 渲染、单击/拖选/拖边缘 | ⬜ |
| 1.3 | 右键菜单：插入/删除行列、合并/拆分 | ⬜ |
| 1.4 | FieldInspector 属性面板 | ⬜ |
| 1.5 | 格子切换 static↔field + 文案编辑 | ⬜ |
| 1.6 | 保存草稿 API + FE | ⬜ |

### Phase 2 — 主题 + 选项集 + 发布

| # | 任务 | 状态 |
|---|------|------|
| 2.1 | 选项集 CRUD + 管理页（全局+私有） | ⬜ |
| 2.2 | ThemePanel：7 项主题配置 | ⬜ |
| 2.3 | PermissionPanel：字段角色绑定 + 可见范围 | ⬜ |
| 2.4 | PublishWizard：快速+分步 | ⬜ |
| 2.5 | publish/unpublish API + 版本快照 | ⬜ |
| 2.6 | 发布后编辑：兼容已有数据 | ⬜ |

### Phase 3 — 填报中心 + 留痕

| # | 任务 | 状态 |
|---|------|------|
| 3.1 | ReportFillHubPage：按报表聚合列表 | ⬜ |
| 3.2 | ReportFillPage：FormGridRenderer + 控件绑定 | ⬜ |
| 3.3 | Fetch-or-create + auto-save + 周期性同步 | ⬜ |
| 3.4 | submission API 系列 | ⬜ |
| 3.5 | SubmissionManagePage：表格+逐份双模式 | ⬜ |
| 3.6 | 时间窗口 + 周期调度 + 过期宽限 | ⬜ |

### Phase 4 — 导出 + 打印

| # | 任务 | 状态 |
|---|------|------|
| 4.1 | Excel 导出：单条+批量 | ⬜ |
| 4.2 | PDF 导出：浏览器+后端 | ⬜ |
| 4.3 | Word 模板导入+书签映射 | ⬜ |
| 4.4 | Word 模板注入导出 | ⬜ |
| 4.5 | 多打印模板管理 | ⬜ |
| 4.6 | 远程打印接口预留 | ⬜ |

### Phase 5 — 模板 + FILE/IMAGE

| # | 任务 | 状态 |
|---|------|------|
| 5.1 | 版本快照列表查看 | ⬜ |
| 5.2 | 另存模板+共享模板+从模板创建 | ⬜ |
| 5.3 | FILE 联动 file-templates + PDF 预览 | ⬜ |
| 5.4 | IMAGE URL+上传+预览 | ⬜ |
| 5.5 | USER 选择器 | ⬜ |

### Phase 6 — 归档 + 删除旧 SmartSheet

| # | 任务 | 状态 |
|---|------|------|
| 6.1 | 归档+列表筛选 | ⬜ |
| 6.2 | 删除旧 smartsheet 前端全部文件 | ⬜ |
| 6.3 | 删除旧 smartsheet 后端全部文件 | ⬜ |
| 6.4 | 删除旧路由/导航/权限种子/表 | ⬜ |

---

## 20. 变更记录

| 日期 | 变更 |
|------|------|
| 2026-06-13 | 初始设计完成。19 项关键决策澄清。34 项任务规划。 |
