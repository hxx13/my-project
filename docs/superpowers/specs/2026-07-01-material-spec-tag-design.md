# 物品规格标签功能 · 设计规格

> 版本: 1.0 | 日期: 2026-07-01 | 状态: 已确认 | 工作流: ① 新功能开发

## 1. 概述

### 1.1 定位

为 Material（学生申领）和 Supplies（教职工领用）两大物资系统同时增加**物品规格标签**功能。规格本质是物品的结构化备注属性——管理员在创建物品时配置规格维度与选项，用户在申领时以 SKU 面板多选组合并加减数量，审核/发放时按规格拆分子卡片独立处理，审计导出时规格信息拼入备注列。

### 1.2 核心原则

- **最小改动**：不新建规格表，规格定义存为物品 JSON 字段，规格快照存为申领行 VARCHAR 字段
- **向下兼容**：旧物品无规格 = 不展示 SKU 面板，保持现有行为不变
- **双系统一致**：Material 和 Supplies 采用相同的字段结构、交互模式和数据流
- **标签化设计**：规格是物品的附加标签，不改变现有业务流程和状态机

### 1.3 涉及范围

| 系统 | 用户 | Web 页面 | 小程序页面 |
|------|------|----------|------------|
| Material | 学生 | 物资商城、我的申领、扫码领用 | studentMaterial、studentMaterialRequests |
| Material | 教职工 | 物品管理、学生审核、审计导出 | materialAdmin、studentReviewHub |
| Supplies | 教职工 | 领用商城、物品管理、发放处理、审计导出 | supplies、suppliesMine、suppliesProcess、suppliesAdmin、suppliesAudit、suppliesClaimExport |

---

## 2. 数据库改动

### 2.1 Material 系统

```sql
-- material_item 表加列
ALTER TABLE material_item
  ADD COLUMN spec_schema JSON NULL COMMENT '规格定义，如 {"尺码":["S","M","L"],"颜色":["红","蓝"]}',
  ADD COLUMN spec_required TINYINT DEFAULT 0 COMMENT '是否强制选规格 0=可选 1=必选';

-- material_request_line 表加列
ALTER TABLE material_request_line
  ADD COLUMN spec_snapshot VARCHAR(500) NULL COMMENT '规格快照，如 {"尺码":"S","颜色":"红"}';
```

### 2.2 Supplies 系统

```sql
-- supply_item 表加列
ALTER TABLE supply_item
  ADD COLUMN spec_schema JSON NULL COMMENT '规格定义',
  ADD COLUMN spec_required TINYINT DEFAULT 0 COMMENT '是否强制选规格';

-- supply_claim_line 表加列
ALTER TABLE supply_claim_line
  ADD COLUMN spec_snapshot VARCHAR(500) NULL COMMENT '规格快照';
```

> supply_claim_line 已有 remark VARCHAR(500) 字段，spec_snapshot 独立存储。出库/审计时可选拼入 remark。

---

## 3. 数据模型

### 3.1 specSchema 格式

```json
{
  "dimensions": [
    {"name": "尺码", "options": ["S", "M", "L"]},
    {"name": "颜色", "options": ["红", "蓝"]}
  ]
}
```

- `name`：规格维度名称
- `options`：该维度的可选值列表
- 至少 1 个维度，每个维度至少 2 个选项
- 空数组或 null 表示该物品无规格

### 3.2 specSnapshot 格式

```json
{"尺码": "S", "颜色": "红"}
```

- key 为维度名，value 为选中值
- 每个维度必须选一个值
- 无规格物品的申领行此字段为 null

### 3.3 SKU 组合生成规则

前端根据 specSchema 做笛卡尔积生成所有组合。如 尺码{S,M,L} × 颜色{红,蓝} = 6 个 SKU：
`S·红, S·蓝, M·红, M·蓝, L·红, L·蓝`

---

## 4. 交互设计

### 4.1 管理端 — 规格配置区

位于创建/编辑物品表单内，stockMode 字段之后：

- **启用规格开关**：勾选后展开规格配置区
- **是否必选开关**：仅在启用规格时可见，控制学生端是否允许跳过
- **规格维度列表**：每行 = 维度名输入框 + 选项标签列表（可增删选项）+ 删除维度按钮
- **添加维度按钮**：在列表底部，点击新增一行空维度

约束：
- 至少 1 个维度，每个维度至少 2 个选项
- 维度名不可重复，同维度选项名不可重复
- 保存时校验，不合法则提示

### 4.2 用户端 — SKU 选择面板

物品卡片内嵌（Material 学生商城 + Supplies 教职工领用 + 扫码领用面板）：

- **无规格物品**：不展示 SKU 面板，保持现有 +/- 直接加减
- **有规格物品**：物品卡片展开显示 SKU 面板
  - 顶部：规格维度行（每个维度一行标签切换，单选）
  - 中部：SKU 网格（笛卡尔积组合，每格显示 `选项1·选项2` + 数量 +/- 步进器）
  - 底部：合计数量和"加入购物车"按钮
  - 若 specRequired=0，面板可收起（默认展开），收起时按"无规格"加入购物车
  - 若 specRequired=1，面板不可收起，未选完所有维度时"加入购物车"按钮置灰

### 4.3 审核/发放页 — 按规格拆分子卡片

Material Review 页 + Supplies Process 页：

- 同一物品的申领行按 specSnapshot 分组
- 每组渲染为一张子卡片，标题为 `物品名 · S·红`
- 无规格的申领行归入"（无规格）"子卡片
- 每个子卡片独立操作（审批/拒绝/发放），互不影响

### 4.4 审计导出 — 备注列拼入规格

Material AuditExport 页 + Supplies AuditExport 页：

- 库存流水表的 remark 列：在规格快照非空时拼入，格式 `尺码:S,颜色:红`
- Excel 导出同样处理
- 旧数据（specSnapshot 为空）remark 保持原样

---

## 5. 业务规则

| 规则 | 说明 |
|------|------|
| 规格必选校验 | specRequired=1 时，提交申领必须每个维度都已选择；否则拦截提示"请选择完整规格" |
| 购物车规格存储 | 购物车 JSON 中每行的 key 从 `itemId` 变为 `itemId::specKey`，specKey 为 `维度1=选项1|维度2=选项2` 格式，无规格物品 specKey 为空串 |
| 同一物品不同规格 | 视为不同购物车行，独立计算数量和库存 |
| 规格修改影响 | 管理员修改物品规格定义后，存量申领行的 specSnapshot 不受影响（快照机制） |
| 规格删除 | 管理员可将 specSchema 清空，物品变为无规格；已有申领行不受影响 |
| 库存扣减 | 按申领行独立扣减，规格不影响库存逻辑 |

---

## 6. 改动清单

### 6.1 后端 — Material 模块

| 文件 | 改动 |
|------|------|
| `entity/MaterialItem.java` | +specSchema (String), +specRequired (Integer) |
| `dto/MaterialItemView.java` | 透出 specSchema, specRequired |
| `dto/MaterialItemUpsertReq.java` | 接收 specSchema, specRequired |
| `entity/MaterialRequestLine.java` | +specSnapshot (String) |
| `dto/MaterialRequestLineView.java` | 透出 specSnapshot |
| `config/MaterialSchemaMigrator.java` | ALTER TABLE material_item +2列, material_request_line +1列 |
| `service/MaterialService.java` | 物品 CRUD 持久化规格字段；申领校验必选规则；写入 specSnapshot |
| `mapper/MaterialItemMapper.xml` | insert/update/resultMap 增加新字段 |
| `mapper/MaterialRequestLineMapper.xml` | insert/resultMap +specSnapshot |

### 6.2 后端 — Supplies 模块

| 文件 | 改动 |
|------|------|
| `entity/SupplyItem.java` | +specSchema (String), +specRequired (Integer) |
| `dto/SupplyItemView.java` | 透出 specSchema, specRequired |
| `dto/SupplyItemUpsertRequest.java` | 接收 specSchema, specRequired |
| `entity/SupplyClaimLine.java` | +specSnapshot (String) |
| `dto/SupplyClaimLineView.java` | 透出 specSnapshot |
| `config/SuppliesSchemaMigrator.java` | ALTER TABLE supply_item +2列, supply_claim_line +1列 |
| `service/SuppliesService.java` | 物品 CRUD 持久化规格；领用校验必选；写入 specSnapshot |
| `mapper/SupplyItemMapper.xml` | insert/update/resultMap +新字段 |
| `mapper/SupplyClaimLineMapper.xml` | insert/resultMap +specSnapshot |

### 6.3 Web 前端 — Material 管理端

| 页面/组件 | 改动 |
|-----------|------|
| `pages/MaterialManagePage.tsx` | 创建/编辑表单增加规格配置区（SpecConfigPanel 子组件） |
| `pages/MaterialReviewPage.tsx` | 按 specSnapshot 拆分子卡片，子卡片独立审批操作 |
| `pages/MaterialAuditExportPage.tsx` | 备注列展示时拼入 specSnapshot |

### 6.4 Web 前端 — Material 学生端 + 快捷业务

| 页面/组件 | 改动 |
|-----------|------|
| `features/student/pages/student-material.tsx` | 物品卡片内嵌 SKU 选择面板 |
| `features/student/pages/student-material-requests.tsx` | 申领行展示规格标签 |
| `components/scanner/MaterialBizPanel.tsx` | 物品卡片内嵌 SKU 选择面板 |

### 6.5 Web 前端 — Supplies 管理端

| 页面/组件 | 改动 |
|-----------|------|
| `pages/AdminSuppliesMallPage.tsx` | 物品卡片内嵌 SKU 选择面板 |
| `pages/AdminSuppliesManagePage.tsx` | 创建/编辑表单增加规格配置区 |
| `pages/AdminSuppliesProcessPage.tsx` | 发放时按规格区分展示子卡片 |
| `pages/AdminSuppliesAuditExportPage.tsx` | 备注列拼入规格信息 |

### 6.6 Web 前端 — 共享层

| 文件 | 改动 |
|------|------|
| `api/domains/material.api.ts` | MaterialItem +specSchema/specRequired; MaterialRequestLine +specSnapshot |
| `api/hooks/useMaterial.ts` | 适配新字段 |
| `api/domains/supplies.api.ts` | SupplyItem +specSchema/specRequired; SupplyClaimLine +specSnapshot（待排查确认文件路径） |

### 6.7 小程序 — Material

| 页面 | 文件 | 改动 |
|------|------|------|
| studentMaterial/index | js/wxml/wxss | SKU 选择面板 |
| studentMaterialRequests/index | js/wxml | 申领行规格标签 |
| materialAdmin/index | js/wxml | 物品创建/编辑 +规格配置区 |
| studentReviewHub/index | js/wxml | 审核按规格拆子卡片 |

### 6.8 小程序 — Supplies

| 页面 | 文件 | 改动 |
|------|------|------|
| supplies/index | js/wxml/wxss | SKU 选择面板 |
| suppliesMine/index | js/wxml | 申领行规格标签 |
| suppliesProcess/index | js/wxml | 发放按规格区分 |
| suppliesAdmin/index | js/wxml | 物品创建/编辑 +规格配置区 |
| suppliesAudit/index | js/wxml | 备注列展示规格 |
| suppliesClaimExport/index | js | 导出含规格信息 |

### 6.9 小程序 — 共享工具层

| 文件 | 改动 |
|------|------|
| `utils/materialStudentApi.js` | 适配 specSchema/specSnapshot 字段 |
| `utils/suppliesApi.js`（待确认路径） | 适配 specSchema/specSnapshot 字段 |

---

## 7. 边界情况

| 场景 | 处理方式 |
|------|----------|
| 旧物品无规格 | specSchema=null，用户端不展示 SKU 面板，购物车 key 不变 |
| 规格必选但用户未选 | 提交时拦截，toast "请选择完整规格" |
| 管理员删除规格定义 | 存量申领行 specSnapshot 不受影响，新申领按无规格处理 |
| 管理员修改规格选项 | 存量申领行不受影响（快照机制），新申领使用新选项 |
| 购物车混合有/无规格物品 | 各自独立计算，按 itemId+specKey 区分行 |
| 审核时同一物品大量规格组合 | 按 specSnapshot 分组，每组一张子卡片；超过 10 组时折叠为"展开全部" |
| 审计导出旧数据 | specSnapshot 为空的行，备注列保持原样不拼接 |
| 库存为 0 的规格组合 | 该 SKU 行置灰显示"无货"，+ 按钮 disabled |

---

## 8. 非功能需求

- **性能**：specSchema JSON 解析在服务端完成，前端直接消费解析后的结构；SKU 笛卡尔积在前端计算
- **兼容性**：所有新增字段有默认值，旧客户端调用 API 不受影响
- **数据一致性**：specSnapshot 写入时机与 snapshotName 一致（申领提交时快照）
