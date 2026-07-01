# 物品规格标签功能 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Material + Supplies 双系统增加规格标签功能——物品创建时配置规格维度，用户端 SKU 面板多选加减，审核端按规格拆分子卡片，审计导出拼入备注。

**Architecture:** 每物品独立 JSON 规格定义存于 `spec_schema` 列，申领行快照存于 `spec_snapshot` 列。Material 和 Supplies 双模块独立加列但交互模式一致。购物车 key 从 `itemId` 扩展为 `itemId::specKey` 以区分不同规格组合。

**Tech Stack:** Java Spring Boot + MyBatis (后端), React TypeScript + Tailwind (Web 前端), 微信小程序原生 (Mini-program)

---

## Phase 1: Backend — Material 模块 Schema + Entity + DTO

### Task 1.1: MaterialItem Entity 加字段

**Files:**
- Modify: `src/main/java/com/example/demo/modules/material/entity/MaterialItem.java`

- [ ] **Step 1: 添加 specSchema 和 specRequired 字段**

在 `MaterialItem.java` 的 `lastInboundAt` 字段之后添加：

```java
/** 规格定义 JSON，如 {"dimensions":[{"name":"尺码","options":["S","M","L"]}]} */
private String specSchema;
/** 是否强制选规格：0=可选 1=必选 */
private Integer specRequired;
```

- [ ] **Step 2: 验证编译**

```bash
cd d:/codex/verson.1.2/20260416 && mvn compile -pl . -q 2>&1 | tail -5
```
Expected: BUILD SUCCESS

---

### Task 1.2: MaterialItemView DTO 透出

**Files:**
- Modify: `src/main/java/com/example/demo/modules/material/dto/MaterialItemView.java`

- [ ] **Step 1: 添加透出字段**

在 `MaterialItemView.java` 的 `lastInboundAt` 之后添加：

```java
private String specSchema;
private Integer specRequired;
```

- [ ] **Step 2: 验证编译**

```bash
cd d:/codex/verson.1.2/20260416 && mvn compile -pl . -q 2>&1 | tail -5
```

---

### Task 1.3: MaterialItemUpsertReq DTO 接收

**Files:**
- Modify: `src/main/java/com/example/demo/modules/material/dto/MaterialItemUpsertReq.java`

- [ ] **Step 1: 添加接收字段**

在 `MaterialItemUpsertReq.java` 的 `showStockQty` 之后添加：

```java
private String specSchema;
private Integer specRequired;
```

- [ ] **Step 2: 验证编译**

```bash
cd d:/codex/verson.1.2/20260416 && mvn compile -pl . -q 2>&1 | tail -5
```

---

### Task 1.4: MaterialRequestLine Entity 加 specSnapshot

**Files:**
- Modify: `src/main/java/com/example/demo/modules/material/entity/MaterialRequestLine.java`

- [ ] **Step 1: 添加字段**

在 `MaterialRequestLine.java` 的 `fulfilledQty` 之后添加：

```java
/** 规格快照 JSON，如 {"尺码":"S","颜色":"红"} */
private String specSnapshot;
```

- [ ] **Step 2: 验证编译**

```bash
cd d:/codex/verson.1.2/20260416 && mvn compile -pl . -q 2>&1 | tail -5
```

---

### Task 1.5: MaterialRequestLineView DTO 透出

**Files:**
- Modify: `src/main/java/com/example/demo/modules/material/dto/MaterialRequestLineView.java`

- [ ] **Step 1: 添加字段**

在 `MaterialRequestLineView.java` 的 `coverUrl` 之后添加：

```java
/** 规格快照 JSON */
private String specSnapshot;
```

- [ ] **Step 2: 验证编译**

```bash
cd d:/codex/verson.1.2/20260416 && mvn compile -pl . -q 2>&1 | tail -5
```

---

### Task 1.6: MaterialSchemaMigrator 加列

**Files:**
- Modify: `src/main/java/com/example/demo/modules/material/config/MaterialSchemaMigrator.java`

- [ ] **Step 1: 在 run() 方法末尾、log.info 之前添加 ensureColumnExists 调用**

在 `MaterialSchemaMigrator.java` 中，`backfillRequestApplicantMetadata()` 调用之后、`log.info("[material-schema]...")` 之前添加：

```java
// spec_schema 规格定义
ensureColumnExists("material_item", "spec_schema",
        "ALTER TABLE material_item ADD COLUMN spec_schema JSON NULL COMMENT '规格定义'");
// spec_required 是否强制选规格
ensureColumnExists("material_item", "spec_required",
        "ALTER TABLE material_item ADD COLUMN spec_required TINYINT NOT NULL DEFAULT 0 COMMENT '是否强制选规格'");
// spec_snapshot 申领行规格快照
ensureColumnExists("material_request_line", "spec_snapshot",
        "ALTER TABLE material_request_line ADD COLUMN spec_snapshot VARCHAR(500) NULL COMMENT '规格快照'");
```

- [ ] **Step 2: 验证编译**

```bash
cd d:/codex/verson.1.2/20260416 && mvn compile -pl . -q 2>&1 | tail -5
```

---

### Task 1.7: MaterialItemMapper.xml 更新

**Files:**
- Modify: `src/main/resources/mapper/MaterialItemMapper.xml`

- [ ] **Step 1: 在 resultMap 中添加新字段映射**

找到 `MaterialItemResultMap`，在 `last_inbound_at` 映射之后添加：

```xml
<result column="spec_schema" property="specSchema"/>
<result column="spec_required" property="specRequired"/>
```

- [ ] **Step 2: 在 insert 语句中添加字段**

找到 `insertMaterialItem`，在字段列表和 VALUES 中添加 `spec_schema, spec_required` 对应 `#{specSchema}, #{specRequired}`。

- [ ] **Step 3: 在 update 语句中添加字段**

找到 `updateMaterialItem`，在 SET 子句中添加：

```xml
<if test="specSchema != null">spec_schema = #{specSchema},</if>
<if test="specRequired != null">spec_required = #{specRequired},</if>
```

- [ ] **Step 4: 在 SELECT 列表中添加字段**

找到 `selectMaterialItem` 相关的 SELECT 查询，在列名列表中添加 `spec_schema, spec_required`。

- [ ] **Step 5: 验证编译**

```bash
cd d:/codex/verson.1.2/20260416 && mvn compile -pl . -q 2>&1 | tail -5
```

---

### Task 1.8: MaterialRequestLineMapper.xml 更新

**Files:**
- Modify: `src/main/resources/mapper/MaterialRequestLineMapper.xml`

- [ ] **Step 1: 在 resultMap 中添加 spec_snapshot**

```xml
<result column="spec_snapshot" property="specSnapshot"/>
```

- [ ] **Step 2: 在 insert 语句中添加字段**

字段列表加 `spec_snapshot`，VALUES 加 `#{specSnapshot}`。

- [ ] **Step 3: 在 SELECT 列表中添加**

所有查询列名列表添加 `spec_snapshot`。

- [ ] **Step 4: 验证编译**

```bash
cd d:/codex/verson.1.2/20260416 && mvn compile -pl . -q 2>&1 | tail -5
```

---

### Task 1.9: MaterialService 规格逻辑

**Files:**
- Modify: `src/main/java/com/example/demo/modules/material/service/MaterialService.java`

- [ ] **Step 1: 物品创建时持久化规格字段**

找到 `createItem` 方法（或类似方法），确保 `MaterialItemUpsertReq` 的 `specSchema` 和 `specRequired` 被写入 `MaterialItem` 实体并持久化。查找现有方法中设置 item 属性的位置，添加：

```java
item.setSpecSchema(req.getSpecSchema());
item.setSpecRequired(req.getSpecRequired() != null ? req.getSpecRequired() : 0);
```

- [ ] **Step 2: 物品更新时持久化规格字段**

找到 `updateItem` 方法，添加同样的 setter 调用（注意 null 检查）。

- [ ] **Step 3: toItemView 方法透出规格字段**

找到 `toItemView` 方法，添加：

```java
view.setSpecSchema(item.getSpecSchema());
view.setSpecRequired(item.getSpecRequired());
```

- [ ] **Step 4: 申领提交时校验 specRequired**

找到 `submitRequest` / `createRequest` 方法。遍历 lines 时，对于每条 line：
1. 根据 `itemId` 查询 MaterialItem
2. 若 `item.specRequired == 1` 且 `line.specSnapshot` 为空/无效 JSON → `throw new TwinBusinessException(ErrorCodeConstants.MATERIAL_SPEC_REQUIRED)`
3. 若 `specSnapshot` 非空，校验其 JSON 格式合法

- [ ] **Step 5: 申领行写入 specSnapshot**

在 `toRequestLine` 或构建 `MaterialRequestLine` 对象的位置，将传入的 specSnapshot 设置到 entity：

```java
line.setSpecSnapshot(reqLine.getSpecSnapshot());
```

- [ ] **Step 6: toRequestLineView 透出 specSnapshot**

在构建 `MaterialRequestLineView` 的方法中添加：

```java
view.setSpecSnapshot(line.getSpecSnapshot());
```

- [ ] **Step 7: 新增错误码**

在 `common/exception/ErrorCodeConstants.java` 中添加：

```java
public static final ErrorCode MATERIAL_SPEC_REQUIRED = 
    new ErrorCode(400, "MATERIAL_SPEC_REQUIRED", "该物品需要选择完整规格");
```

- [ ] **Step 8: 验证编译**

```bash
cd d:/codex/verson.1.2/20260416 && mvn compile -pl . -q 2>&1 | tail -5
```

---

## Phase 2: Backend — Supplies 模块 Schema + Entity + DTO

### Task 2.1: SupplyItem Entity 加字段

**Files:**
- Modify: `src/main/java/com/example/demo/modules/supplies/entity/SupplyItem.java`

- [ ] **Step 1: 添加字段**

在 `SupplyItem.java` 的 `lastInboundAt` 之后添加：

```java
private String specSchema;
private Integer specRequired;
```

- [ ] **Step 2: 验证编译**

---

### Task 2.2: SupplyItemView DTO

**Files:**
- Modify: `src/main/java/com/example/demo/modules/supplies/dto/SupplyItemView.java`

- [ ] **Step 1: 添加透出字段**

```java
private String specSchema;
private Integer specRequired;
```

- [ ] **Step 2: 验证编译**

---

### Task 2.3: SupplyItemUpsertRequest DTO

**Files:**
- Modify: `src/main/java/com/example/demo/modules/supplies/dto/SupplyItemUpsertRequest.java`

- [ ] **Step 1: 添加接收字段**

在 `stockQty` 之后：

```java
private String specSchema;
private Integer specRequired;
```

- [ ] **Step 2: 验证编译**

---

### Task 2.4: SupplyClaimLine Entity 加 specSnapshot

**Files:**
- Modify: `src/main/java/com/example/demo/modules/supplies/entity/SupplyClaimLine.java`

- [ ] **Step 1: 添加字段**

在 `remark` 之后：

```java
private String specSnapshot;
```

- [ ] **Step 2: 验证编译**

---

### Task 2.5: SupplyClaimLineView DTO

**Files:**
- Modify: `src/main/java/com/example/demo/modules/supplies/dto/SupplyClaimLineView.java`

- [ ] **Step 1: 添加透出字段**

```java
private String specSnapshot;
```

- [ ] **Step 2: 验证编译**

---

### Task 2.6: SuppliesSchemaMigrator 加列

**Files:**
- Modify: `src/main/java/com/example/demo/modules/supplies/config/SuppliesSchemaMigrator.java`

- [ ] **Step 1: 在 run() 方法末尾（log.info 之前）添加 ensureColumnExists**

```java
ensureColumnExists("supply_item", "spec_schema",
        "ALTER TABLE supply_item ADD COLUMN spec_schema JSON NULL COMMENT '规格定义'");
ensureColumnExists("supply_item", "spec_required",
        "ALTER TABLE supply_item ADD COLUMN spec_required TINYINT NOT NULL DEFAULT 0 COMMENT '是否强制选规格'");
ensureColumnExists("supply_claim_line", "spec_snapshot",
        "ALTER TABLE supply_claim_line ADD COLUMN spec_snapshot VARCHAR(500) NULL COMMENT '规格快照'");
```

- [ ] **Step 2: 验证编译**

---

### Task 2.7: SupplyItemMapper.xml 更新

**Files:**
- Modify: `src/main/resources/mapper/SupplyItemMapper.xml`

- [ ] **Step 1: resultMap + insert + update + SELECT 全部添加新字段**

同 Phase 1 Task 1.7 模式，字段名 `spec_schema` / `spec_required`。

- [ ] **Step 2: 验证编译**

---

### Task 2.8: SupplyClaimLineMapper.xml 更新

**Files:**
- Modify: `src/main/resources/mapper/SupplyClaimLineMapper.xml`

- [ ] **Step 1: resultMap + insert + SELECT 添加 spec_snapshot**

同 Phase 1 Task 1.8 模式。

- [ ] **Step 2: 验证编译**

---

### Task 2.9: SuppliesService 规格逻辑

**Files:**
- Modify: `src/main/java/com/example/demo/modules/supplies/service/SuppliesService.java`

- [ ] **Step 1: 物品创建/更新时持久化 specSchema + specRequired**

在 build/update item 实体的位置（查找 `SupplyItemUpsertRequest` 使用处），添加：

```java
item.setSpecSchema(req.getSpecSchema());
item.setSpecRequired(req.getSpecRequired() != null ? req.getSpecRequired() : 0);
```

- [ ] **Step 2: toItemView 透出**

```java
view.setSpecSchema(item.getSpecSchema());
view.setSpecRequired(item.getSpecRequired());
```

- [ ] **Step 3: 领用提交时校验 specRequired**

在 `createClaim` 或类似方法中，遍历 lines：
1. 查询 SupplyItem
2. 若 item.specRequired == 1 且 specSnapshot 为空 → throw TwinBusinessException

- [ ] **Step 4: 领用行写入 specSnapshot**

在构建 SupplyClaimLine 的位置添加：

```java
line.setSpecSnapshot(reqLine.getSpecSnapshot());
```

- [ ] **Step 5: toClaimLineView 透出 specSnapshot**

```java
view.setSpecSnapshot(line.getSpecSnapshot());
```

- [ ] **Step 6: 验证编译**

---

## Phase 3: Frontend — 共享 API 类型层

### Task 3.1: Material API TypeScript 类型更新

**Files:**
- Modify: `frontend/src/api/domains/material.api.ts`

- [ ] **Step 1: MaterialItem 接口加字段**

在 `MaterialItem` 接口的 `lastInboundAt` 之后添加：

```ts
specSchema?: string;   // JSON: {"dimensions":[{"name":"尺码","options":["S","M","L"]}]}
specRequired?: number; // 0=可选 1=必选
```

- [ ] **Step 2: MaterialRequestLine 接口加字段**

在 `MaterialRequestLine` 接口的 `fulfilledQty` 之后添加：

```ts
specSnapshot?: string; // JSON: {"尺码":"S","颜色":"红"}
```

- [ ] **Step 3: 检查 createMaterialRequest 的 lines 参数**

确认 `CreateMaterialRequestReq` 中的 `lines` 类型也包含 `specSnapshot` 字段。如需要，更新相关请求类型：

```ts
export interface CreateMaterialRequestLine {
  itemId: number;
  qty: number;
  specSnapshot?: string;
}
```

---

### Task 3.2: Supplies API TypeScript 类型更新

**Files:**
- Modify: `frontend/src/api/domains/supplies.api.ts`

- [ ] **Step 1: SupplyItem 接口加字段**

在 `SupplyItem` 接口的 `noveltyTag` 之后添加：

```ts
specSchema?: string;
specRequired?: number;
```

- [ ] **Step 2: SupplyClaimLine 接口加字段**

在 `SupplyClaimLine` 接口的 `remark` 之后添加：

```ts
specSnapshot?: string;
```

- [ ] **Step 3: 更新创建领用的请求类型**

如果存在 `CreateSupplyClaimRequest` 类型，确保其 `lines` 中每行可传 `specSnapshot`。

---

### Task 3.3: Material React Hooks 适配

**Files:**
- Modify: `frontend/src/api/hooks/useMaterial.ts`

- [ ] **Step 1: 检查并确认 hooks 无需更改**

React Query hooks 的 query/mutation 函数直接调用 `material.api.ts` 中的 API 函数，类型已在上一步更新。确认 `useCreateAdminMaterialItem` 和 `useUpdateAdminMaterialItem` 的 mutation 参数类型已包含新字段。

---

## Phase 4: Web Admin — Material 页面

### Task 4.1: MaterialManagePage — 创建表单加规格配置

**Files:**
- Modify: `frontend/src/pages/MaterialManagePage.tsx`

- [ ] **Step 1: 添加规格相关 state**

在现有 state 声明区域添加：

```tsx
const [createSpecEnabled, setCreateSpecEnabled] = useState(false);
const [createSpecDimensions, setCreateSpecDimensions] = useState<{name:string; options:string[]}[]>([]);
const [createSpecRequired, setCreateSpecRequired] = useState(false);

// 编辑时
const [editSpecEnabled, setEditSpecEnabled] = useState(false);
const [editSpecDimensions, setEditSpecDimensions] = useState<{name:string; options:string[]}[]>([]);
const [editSpecRequired, setEditSpecRequired] = useState(false);
```

- [ ] **Step 2: 在创建表单（showStockQty checkbox 之后）插入规格配置区 JSX**

```tsx
{/* 规格配置 */}
<label className="flex items-center gap-2 col-span-2 pt-2">
  <input type="checkbox" checked={createSpecEnabled} onChange={e => setCreateSpecEnabled(e.target.checked)} className="rounded" />
  <span className="text-xs text-[var(--twin-body)]">启用规格（学生需选择规格才能申领）</span>
</label>
{createSpecEnabled && (
  <div className="col-span-2 space-y-2 border border-[var(--twin-hairline)] rounded-twin-md p-3">
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={createSpecRequired} onChange={e => setCreateSpecRequired(e.target.checked)} className="rounded" />
      <span className="text-xs text-[var(--twin-body)]">强制选择规格（不允许跳过）</span>
    </label>
    {createSpecDimensions.map((dim, di) => (
      <div key={di} className="flex items-center gap-2 flex-wrap">
        <input className="w-16 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1 py-0.5 text-xs" placeholder="维度名"
          value={dim.name} onChange={e => {
            const next = [...createSpecDimensions]; next[di] = {...next[di], name: e.target.value}; setCreateSpecDimensions(next);
          }} />
        {dim.options.map((opt, oi) => (
          <span key={oi} className="inline-flex items-center gap-1 bg-[var(--twin-canvas)] border border-[var(--twin-hairline)] rounded-full px-2 py-0.5 text-xs">
            <input className="w-10 border-none bg-transparent text-xs outline-none" placeholder="选项"
              value={opt} onChange={e => {
                const next = [...createSpecDimensions];
                next[di] = {...next[di], options: [...next[di].options]};
                next[di].options[oi] = e.target.value;
                setCreateSpecDimensions(next);
              }} />
            <button type="button" className="text-red-400 hover:text-red-600" onClick={() => {
              const next = [...createSpecDimensions];
              next[di] = {...next[di], options: next[di].options.filter((_, i) => i !== oi)};
              setCreateSpecDimensions(next);
            }}>×</button>
          </span>
        ))}
        <button type="button" className="text-xs text-[var(--twin-link-deep)]" onClick={() => {
          const next = [...createSpecDimensions];
          next[di] = {...next[di], options: [...next[di].options, '']};
          setCreateSpecDimensions(next);
        }}>+选项</button>
        <button type="button" className="text-xs text-red-400" onClick={() => {
          setCreateSpecDimensions(createSpecDimensions.filter((_, i) => i !== di));
        }}>删维度</button>
      </div>
    ))}
    <button type="button" className="text-xs text-[var(--twin-link-deep)]" onClick={() => {
      setCreateSpecDimensions([...createSpecDimensions, {name:'', options:['','']}]);
    }}>+ 添加规格维度</button>
  </div>
)}
```

- [ ] **Step 3: 修改 doCreate 函数，拼入规格字段**

在 `doCreate` 的 `createItemMut.mutate` 调用中，添加：

```tsx
specSchema: createSpecEnabled && createSpecDimensions.length > 0
  ? JSON.stringify({ dimensions: createSpecDimensions.filter(d => d.name.trim() && d.options.filter(o => o.trim()).length >= 2) })
  : undefined,
specRequired: createSpecEnabled && createSpecRequired ? 1 : 0,
```

- [ ] **Step 4: 在编辑弹窗中添加对称的规格配置区**

在编辑表单 `editShowStockQty` checkbox 之后，添加与创建表单对称的规格配置 JSX（使用 `editSpecEnabled`, `editSpecDimensions`, `editSpecRequired` 等 state）。

- [ ] **Step 5: 编辑弹窗打开时回填规格数据**

当 `setEditingItem(item)` 被调用时（查找设置 editingItem 的地方），同步解析规格：

```tsx
if (item.specSchema) {
  try {
    const parsed = JSON.parse(item.specSchema);
    setEditSpecEnabled(true);
    setEditSpecDimensions(parsed.dimensions || []);
    setEditSpecRequired(item.specRequired === 1);
  } catch { setEditSpecEnabled(false); }
} else {
  setEditSpecEnabled(false);
  setEditSpecDimensions([]);
  setEditSpecRequired(false);
}
```

- [ ] **Step 6: 修改 saveEdit 函数拼入规格字段**

在 `updateItemMut.mutate` 的 body 中添加：

```tsx
specSchema: editSpecEnabled && editSpecDimensions.length > 0
  ? JSON.stringify({ dimensions: editSpecDimensions.filter(d => d.name.trim() && d.options.filter(o => o.trim()).length >= 2) })
  : undefined,
specRequired: editSpecEnabled && editSpecRequired ? 1 : 0,
```

- [ ] **Step 7: 验证创建和编辑不报 UI 错误**

手动测试：创建带规格物品 → 编辑 → 保存。浏览器 console 应无报错。

---

### Task 4.2: MaterialReviewPage — 按规格拆分子卡片

**Files:**
- Modify: `frontend/src/pages/MaterialReviewPage.tsx`

- [ ] **Step 1: 找到现有卡片渲染位置（按 item 分组）**

找到 `items.map(...)` 或 `Object.entries(groupedRequests)...` 的渲染逻辑。

- [ ] **Step 2: 将每个 item 的申领行按 specSnapshot 二级分组**

```tsx
// 在现有 item 分组内，对 lines 做二级分组
const specGroups = new Map<string, typeof lines>();
for (const line of lines) {
  const key = line.specSnapshot || '__no_spec__';
  if (!specGroups.has(key)) specGroups.set(key, []);
  specGroups.get(key)!.push(line);
}
```

- [ ] **Step 3: 渲染子卡片**

对于每个 specGroup 渲染一张子卡片：

```tsx
{Array.from(specGroups.entries()).map(([specKey, specLines]) => {
  const specLabel = specKey === '__no_spec__' ? '（无规格）' : formatSpecLabel(specKey);
  return (
    <div key={specKey} className="ml-4 border-l-2 border-[var(--twin-hairline)] pl-3 mb-2">
      <div className="text-xs font-medium text-[var(--twin-mute)] mb-1">{itemName} · {specLabel}</div>
      {specLines.map(line => (/* 现有单行渲染逻辑 */))}
    </div>
  );
})}
```

- [ ] **Step 4: 添加 formatSpecLabel 工具函数**

```tsx
function formatSpecLabel(specJson: string): string {
  try {
    const obj = JSON.parse(specJson);
    return Object.values(obj).join('·');
  } catch { return specJson; }
}
```

- [ ] **Step 5: 审批操作不变**

每行的 approve/reject 按钮不变，独立发送。确保子卡片结构不影响按钮的事件绑定。

- [ ] **Step 6: 验证审核页按规格展示**

手动测试：有规格的物品提交申领 → 审核页应展示拆分后的子卡片。

---

### Task 4.3: MaterialAuditExportPage — 备注列展示规格

**Files:**
- Modify: `frontend/src/pages/MaterialAuditExportPage.tsx`

- [ ] **Step 1: 找到库存流水表格的"备注"列渲染位置**

在流水表格的列定义中查找 `remark` 列。

- [ ] **Step 2: 修改备注列渲染逻辑**

如果 specSnapshot 存在于该行数据中，拼入显示：

```tsx
{
  key: 'remark',
  header: '备注',
  render: (row) => {
    let text = row.remark || '';
    if (row.specSnapshot) {
      try {
        const spec = JSON.parse(row.specSnapshot);
        const specStr = Object.entries(spec).map(([k,v]) => `${k}:${v}`).join(', ');
        text = text ? `${text} | ${specStr}` : specStr;
      } catch {}
    }
    return <span className="text-xs">{text || '-'}</span>;
  }
}
```

- [ ] **Step 3: 确认导出 Excel 函数也处理 specSnapshot**

查找 Excel 导出的数据构建位置，确保 `remark` 列同样拼入规格信息。

---

## Phase 5: Web Admin — Supplies 页面

### Task 5.1: AdminSuppliesManagePage — 创建/编辑加规格配置

**Files:**
- Modify: `frontend/src/pages/AdminSuppliesManagePage.tsx`

- [ ] **Step 1: 按 Task 4.1 模式添加规格配置**

在 Supplies 的物品创建表单和编辑表单中，按 Material 管理页相同的模式添加规格配置区（复选框开关 + 维度列表 + 选项标签）。

- [ ] **Step 2: 创建/编辑 API 调用传 specSchema + specRequired**

---

### Task 5.2: AdminSuppliesMallPage — SKU 选择面板

**Files:**
- Modify: `frontend/src/pages/AdminSuppliesMallPage.tsx`

- [ ] **Step 1: 找到物品卡片的渲染位置**

查找物品网格中每个 item 的渲染代码。

- [ ] **Step 2: 判断是否有规格，有则展开 SKU 面板**

```tsx
const hasSpec = item.specSchema && (() => {
  try { const p = JSON.parse(item.specSchema); return p.dimensions?.length > 0; }
  catch { return false; }
})();
```

- [ ] **Step 3: 有规格物品渲染 SKU 选择面板**

展开规格维度行（每个维度一行标签按钮）→ 笛卡尔积生成 SKU 网格 → 每个 SKU 行有 -/数量/+ 步进器。

- [ ] **Step 4: 购物车 key 改为 itemId::specKey**

```tsx
const cartKey = specKey ? `${itemId}::${specKey}` : `${itemId}`;
```

其中 specKey 为 `维度1=选项1|维度2=选项2` 格式。

- [ ] **Step 5: specRequired 校验**

提交领用时，遍历购物车行找出 specRequired=1 的物品，若 cartKey 不含 `::`（即未选规格），toast 拦截。

---

### Task 5.3: AdminSuppliesProcessPage — 发放按规格区分

**Files:**
- Modify: `frontend/src/pages/AdminSuppliesProcessPage.tsx`

- [ ] **Step 1: 按 Task 4.2 模式按 specSnapshot 分组展示子卡片**

在领用单明细中，同一物品的申领行按 specSnapshot 二级分组，每组一张子卡片。

---

### Task 5.4: AdminSuppliesAuditExportPage — 备注列展示规格

**Files:**
- Modify: `frontend/src/pages/AdminSuppliesAuditExportPage.tsx`

- [ ] **Step 1: 按 Task 4.3 模式修改备注列和 Excel 导出**

关注 `SupplyInventoryMovement` 的 remark 列是否已包含在流水查询结果中，以及 specSnapshot 是否可从 claim_line 关联获取。后端 API `/api/supplies/admin/audit/item/{itemId}/movements` 返回的数据可能需要在后端 DTO 中增加 specSnapshot 字段。

---

## Phase 6: Web Student — Material 学生端 + 快捷业务

### Task 6.1: student-material.tsx — SKU 面板

**Files:**
- Modify: `frontend/src/features/student/pages/student-material.tsx`

- [ ] **Step 1: 按 Task 5.2 模式添加 SKU 面板**

物品卡片中判断 specSchema，有规格则展开 SKU 选择面板。学生端需要同时处理 specRequired 校验。

- [ ] **Step 2: 购物车行 key 扩展为 itemId::specKey**

与 Task 5.2 Step 4 逻辑一致。

- [ ] **Step 3: 提交申领时传入 specSnapshot**

`createMaterialRequest` 的 lines 数组每行携带 `specSnapshot` JSON 字符串。

---

### Task 6.2: student-material-requests.tsx — 申领行规格标签

**Files:**
- Modify: `frontend/src/features/student/pages/student-material-requests.tsx`

- [ ] **Step 1: 每条申领行展示规格标签**

在 line 的 snapshotName 旁边，如果有 specSnapshot，展示彩色标签：

```tsx
{line.specSnapshot && (() => {
  try {
    const spec = JSON.parse(line.specSnapshot);
    return <span className="text-[10px] bg-[var(--twin-primary)]/10 text-[var(--twin-primary)] rounded-full px-1.5 py-0.5">
      {Object.values(spec).join('·')}
    </span>;
  } catch { return null; }
})()}
```

---

### Task 6.3: MaterialBizPanel.tsx — 扫码领用 SKU 面板

**Files:**
- Modify: `frontend/src/components/scanner/MaterialBizPanel.tsx`

- [ ] **Step 1: 按 Task 5.2 模式添加 SKU 面板**

扫码领用面板中的物品卡片同样添加 SKU 选择。注意此面板的购物车是局部状态（非全局 cart API），直接在组件内管理 specKey。

---

## Phase 7: Mini-program — Material 小程序页面

### Task 7.1: studentMaterial/index — 学生 SKU 面板

**Files:**
- Modify: `aroapp/miniprogram/package-feature/pages/studentMaterial/index.js`
- Modify: `aroapp/miniprogram/package-feature/pages/studentMaterial/index.wxml`
- Modify: `aroapp/miniprogram/package-feature/pages/studentMaterial/index.wxss`

- [ ] **Step 1: JS 增加规格选择 state 和 SKU 生成逻辑**

```js
// 在 data 中添加
specSelections: {},  // { [itemId]: { [dimName]: selectedOption } }
cartSpecKeys: {},    // { [cartKey]: specKey }

// 笛卡尔积生成函数
generateSkus(dimensions) {
  if (!dimensions || dimensions.length === 0) return [];
  let combos = [{}];
  for (const dim of dimensions) {
    const next = [];
    for (const combo of combos) {
      for (const opt of dim.options) {
        next.push({ ...combo, [dim.name]: opt });
      }
    }
    combos = next;
  }
  return combos;
}
```

- [ ] **Step 2: WXML 添加 SKU 面板模板**

物品卡片内使用 `wx:if="{{item.specSchema}}"` 条件渲染 SKU 选择区：
- 维度行：scroll-view 横向滚动标签
- SKU 网格：每行显示组合名 + stepper

- [ ] **Step 3: WXSS 添加 SKU 面板样式**

标签、网格、步进器的样式。

- [ ] **Step 4: 购物车 key 适配**

local cart storage key 从 `itemId` 变为 `itemId::specKey`。

---

### Task 7.2: studentMaterialRequests/index — 规格标签

**Files:**
- Modify: `aroapp/miniprogram/package-feature/pages/studentMaterialRequests/index.js`
- Modify: `aroapp/miniprogram/package-feature/pages/studentMaterialRequests/index.wxml`

- [ ] **Step 1: WXML 每条申领行展示规格标签**

```xml
<view wx:if="{{line.specSnapshot}}" class="spec-tag">
  {{formatSpec(line.specSnapshot)}}
</view>
```

- [ ] **Step 2: JS 添加 formatSpec 函数**

```js
formatSpec(json) {
  try { return Object.values(JSON.parse(json)).join('·'); }
  catch { return ''; }
}
```

---

### Task 7.3: materialAdmin/index — 物品创建/编辑加规格配置

**Files:**
- Modify: `aroapp/miniprogram/package-feature/pages/materialAdmin/index.js`
- Modify: `aroapp/miniprogram/package-feature/pages/materialAdmin/index.wxml`

- [ ] **Step 1: 物品表单中添加规格配置区**

按 Web 端 Task 4.1 模式，在小程序创建/编辑物品表单中添加：
- 启用规格 switch
- 必选 switch
- 维度列表（每行：维度名 input + 选项标签列表 + 添加选项/删除按钮）
- 添加维度按钮

- [ ] **Step 2: 保存时序列化 specSchema JSON**

```js
const specSchema = specEnabled && specDimensions.length > 0
  ? JSON.stringify({ dimensions: specDimensions })
  : null;
```

- [ ] **Step 3: 编辑时回填解析**

---

### Task 7.4: studentReviewHub/index — 审核按规格拆子卡片

**Files:**
- Modify: `aroapp/miniprogram/package-feature/pages/studentReviewHub/index.js`
- Modify: `aroapp/miniprogram/package-feature/pages/studentReviewHub/index.wxml`

- [ ] **Step 1: JS 按 specSnapshot 二级分组**

```js
// 在现有 item 分组逻辑后
for (const line of itemLines) {
  const specKey = line.specSnapshot || '__no_spec__';
  // group...
}
```

- [ ] **Step 2: WXML 渲染子卡片**

每个 spec group 一个子卡片块，标题显示 `物品名 · 规格标签`。

---

## Phase 8: Mini-program — Supplies 小程序页面

### Task 8.1: supplies/index — 教职工领用 SKU 面板

**Files:**
- Modify: `aroapp/miniprogram/package-feature/pages/supplies/index.js`
- Modify: `aroapp/miniprogram/package-feature/pages/supplies/index.wxml`
- Modify: `aroapp/miniprogram/package-feature/pages/supplies/index.wxss`

- [ ] **Step 1: 按 Task 7.1 模式添加 SKU 面板**

与 Material 学生端一致的模式。注意 supplies 的购物车存储 key 也需要扩展。

---

### Task 8.2: suppliesMine/index — 规格标签

**Files:**
- Modify: `aroapp/miniprogram/package-feature/pages/suppliesMine/index.wxml`

- [ ] **Step 1: 领用记录行展示规格标签**

按 Task 7.2 模式。

---

### Task 8.3: suppliesProcess/index — 发放按规格区分

**Files:**
- Modify: `aroapp/miniprogram/package-feature/pages/suppliesProcess/index.js`
- Modify: `aroapp/miniprogram/package-feature/pages/suppliesProcess/index.wxml`

- [ ] **Step 1: 按 specSnapshot 拆分子卡片**

按 Task 7.4 模式。

---

### Task 8.4: suppliesAdmin/index — 物品创建/编辑加规格配置

**Files:**
- Modify: `aroapp/miniprogram/package-feature/pages/suppliesAdmin/index.js`
- Modify: `aroapp/miniprogram/package-feature/pages/suppliesAdmin/index.wxml`

- [ ] **Step 1: 按 Task 7.3 模式添加规格配置表单**

---

### Task 8.5: suppliesAudit/index — 备注列展示规格

**Files:**
- Modify: `aroapp/miniprogram/package-feature/pages/suppliesAudit/index.js`
- Modify: `aroapp/miniprogram/package-feature/pages/suppliesAudit/index.wxml`

- [ ] **Step 1: 库存流水列表 remark 列拼接 specSnapshot**

---

### Task 8.6: suppliesClaimExport/index — 导出含规格

**Files:**
- Modify: `aroapp/miniprogram/package-feature/pages/suppliesClaimExport/index.js`

- [ ] **Step 1: Excel 导出数据包含 specSnapshot**

如果此页面有数据构建逻辑，确保 specSnapshot 被传递到导出函数。

---

## Phase 9: Mini-program — 共享工具层

### Task 9.1: materialStudentApi.js 适配

**Files:**
- Modify: `aroapp/miniprogram/package-feature/utils/materialStudentApi.js`

- [ ] **Step 1: 更新 decorateItems 函数**

确保从 API 返回的 item 对象中透传 `specSchema` 和 `specRequired` 字段。

- [ ] **Step 2: 更新 decorateRequestLines 函数**

确保从 API 返回的 line 对象中透传 `specSnapshot` 字段。

- [ ] **Step 3: 添加 specKey 构建工具函数**

```js
export function buildSpecKey(specSelections) {
  if (!specSelections || Object.keys(specSelections).length === 0) return '';
  return Object.entries(specSelections)
    .map(([k, v]) => `${k}=${v}`)
    .join('|');
}

export function buildCartKey(itemId, specKey) {
  return specKey ? `${itemId}::${specKey}` : `${itemId}`;
}

export function parseSpecLabel(specSnapshot) {
  try { return Object.values(JSON.parse(specSnapshot)).join('·'); }
  catch { return ''; }
}
```

---

### Task 9.2: supplies 小程序各页面 API 调用适配

Supplies 小程序各页面直接内联调用 API（无独立 utils 文件）。需要在每个涉及物品/领用行数据的页面 JS 中确认字段透传。

**Files:**
- Check: `aroapp/miniprogram/package-feature/pages/supplies/index.js` (物品列表渲染)
- Check: `aroapp/miniprogram/package-feature/pages/suppliesMine/index.js` (领用行数据)
- Check: `aroapp/miniprogram/package-feature/pages/suppliesProcess/index.js` (领用行数据)
- Check: `aroapp/miniprogram/package-feature/pages/suppliesAdmin/index.js` (物品 CRUD)
- Check: `aroapp/miniprogram/package-feature/pages/suppliesAudit/index.js` (流水数据)

- [ ] **Step 1: 物品数据透传 specSchema/specRequired**

在每个页面的物品列表 API 回包处理中（通常在 `.then()` 或 `decorateItems` 逻辑中），确认 `specSchema` 和 `specRequired` 字段未被过滤掉。若 `wx.request` 返回的 `res.data` 直接 setData，则无需额外处理——JSON 字段自然透传。

- [ ] **Step 2: 领用行数据透传 specSnapshot**

在每个页面的领用单/行数据回包处理中，确认 `specSnapshot` 字段被保留。若使用了 `map` 或对象解构重构，需要显式保留此字段。**

---

## 验证与收尾

### Task V.1: 启动后端验证 Schema 迁移

- [ ] **Step 1: 启动 Spring Boot 应用**

```bash
cd d:/codex/verson.1.2/20260416 && mvn spring-boot:run
```

- [ ] **Step 2: 检查日志确认 Schema 迁移成功**

查看日志中 `[material-schema]` 和 `[supplies-schema]` 的输出，确认新列创建成功。

- [ ] **Step 3: 用 MySQL 客户端验证新列**

```sql
DESC material_item;  -- 应有 spec_schema, spec_required
DESC material_request_line;  -- 应有 spec_snapshot
DESC supply_item;  -- 应有 spec_schema, spec_required
DESC supply_claim_line;  -- 应有 spec_snapshot
```

---

### Task V.2: 端到端流程测试

- [ ] **Step 1: Material 系统完整流程**

管理端创建带规格物品（尺码:S/M/L, 颜色:红/蓝, 必选） → 学生端 SKU 面板选购 → 提交申领 → 审核页按规格拆分 → 审批 → 审计导出查看备注列

- [ ] **Step 2: Supplies 系统完整流程**

管理端创建带规格物品 → 教职工领用端 SKU 面板 → 提交领用 → 发放页按规格区分 → 审计导出查看备注列

- [ ] **Step 3: 边界情况测试**

旧物品（无规格）不受影响；specRequired=1 时未选规格被拦截；编辑物品修改/清空规格定义不影响存量申领行

---

### Task V.3: 小程序编译验证

- [ ] **Step 1: 微信开发者工具编译检查**

打开 `aroapp/miniprogram` 项目，编译检查所有改动的页面无报错。

- [ ] **Step 2: 真机预览功能测试**

---


## 改动文件总览

| # | 文件 | 改动类型 | Phase |
|---|------|----------|-------|
| 1 | `MaterialItem.java` | Modify | 1.1 |
| 2 | `MaterialItemView.java` | Modify | 1.2 |
| 3 | `MaterialItemUpsertReq.java` | Modify | 1.3 |
| 4 | `MaterialRequestLine.java` | Modify | 1.4 |
| 5 | `MaterialRequestLineView.java` | Modify | 1.5 |
| 6 | `MaterialSchemaMigrator.java` | Modify | 1.6 |
| 7 | `MaterialItemMapper.xml` | Modify | 1.7 |
| 8 | `MaterialRequestLineMapper.xml` | Modify | 1.8 |
| 9 | `MaterialService.java` | Modify | 1.9 |
| 10 | `ErrorCodeConstants.java` | Modify | 1.9 |
| 11 | `SupplyItem.java` | Modify | 2.1 |
| 12 | `SupplyItemView.java` | Modify | 2.2 |
| 13 | `SupplyItemUpsertRequest.java` | Modify | 2.3 |
| 14 | `SupplyClaimLine.java` | Modify | 2.4 |
| 15 | `SupplyClaimLineView.java` | Modify | 2.5 |
| 16 | `SuppliesSchemaMigrator.java` | Modify | 2.6 |
| 17 | `SupplyItemMapper.xml` | Modify | 2.7 |
| 18 | `SupplyClaimLineMapper.xml` | Modify | 2.8 |
| 19 | `SuppliesService.java` | Modify | 2.9 |
| 20 | `material.api.ts` | Modify | 3.1 |
| 21 | `supplies.api.ts` | Modify | 3.2 |
| 22 | `useMaterial.ts` | Modify | 3.3 |
| 23 | `MaterialManagePage.tsx` | Modify | 4.1 |
| 24 | `MaterialReviewPage.tsx` | Modify | 4.2 |
| 25 | `MaterialAuditExportPage.tsx` | Modify | 4.3 |
| 26 | `AdminSuppliesManagePage.tsx` | Modify | 5.1 |
| 27 | `AdminSuppliesMallPage.tsx` | Modify | 5.2 |
| 28 | `AdminSuppliesProcessPage.tsx` | Modify | 5.3 |
| 29 | `AdminSuppliesAuditExportPage.tsx` | Modify | 5.4 |
| 30 | `student-material.tsx` | Modify | 6.1 |
| 31 | `student-material-requests.tsx` | Modify | 6.2 |
| 32 | `MaterialBizPanel.tsx` | Modify | 6.3 |
| 33-36 | `studentMaterial/index.{js,wxml,wxss}` | Modify | 7.1 |
| 37-38 | `studentMaterialRequests/index.{js,wxml}` | Modify | 7.2 |
| 39-40 | `materialAdmin/index.{js,wxml}` | Modify | 7.3 |
| 41-42 | `studentReviewHub/index.{js,wxml}` | Modify | 7.4 |
| 43-45 | `supplies/index.{js,wxml,wxss}` | Modify | 8.1 |
| 46 | `suppliesMine/index.wxml` | Modify | 8.2 |
| 47-48 | `suppliesProcess/index.{js,wxml}` | Modify | 8.3 |
| 49-50 | `suppliesAdmin/index.{js,wxml}` | Modify | 8.4 |
| 51-52 | `suppliesAudit/index.{js,wxml}` | Modify | 8.5 |
| 53 | `suppliesClaimExport/index.js` | Modify | 8.6 |
| 54 | `materialStudentApi.js` | Modify | 9.1 |
| 55 | supplies 小程序 API 工具 | Modify | 9.2 |
