---
references:
  design:
    - skills/design/db-designer.yaml
    - skills/design/entity-designer.yaml
    - skills/design/api-designer.yaml
    - skills/design/crud-designer.yaml
    - skills/design/frontend-designer.yaml
  module_guide:
    prompt: "请指定目标模块（twin / telemetry / auth / dahua / accessrule / pagepermission 等）"
    mapping:
      twin: skills/modules/twin/skill-twin.yaml
      telemetry: skills/modules/telemetry/skill-telemetry.yaml
      auth: skills/modules/auth/skill-auth.yaml
      dahua: skills/modules/dahua/skill-dahua.yaml
      accessrule: skills/modules/accessrule/skill-accessrule.yaml
      pagepermission: skills/modules/pagepermission/skill-pagepermission.yaml
---

# 实体与 CRUD 完整流程（Twin System）

## 流程

```text
DDL（schema.sql + scripts）→ Entity → Mapper(+XML) → Service → Controller/DTO
→ frontend api + 页面 / aroapp API
→ 单测（推荐）
```

## 检查清单

### 数据库

- [ ] `src/main/resources/schema.sql` 已更新
- [ ] `scripts/<主题>_*.ddl.sql` 已提供
- [ ] 若用 SchemaMigrator，与上述 SQL 一致
- [ ] PR 说明目标库与执行脚本（见 `scripts/DEPLOY_DDL.md`）

### 后端

- [ ] 包路径 `com.example.demo.modules.{module}.*`
- [ ] 接口返回 `Result<T>`
- [ ] 写操作 `@Transactional` 在 Service
- [ ] JDBC `?` 占位符数量已核对

### 前端

- [ ] `frontend/src/api/domains/*.api.ts`
- [ ] 保存成功：就地合并，禁止整表 load（`post-save-no-full-refresh.mdc`）
- [ ] 若管理端新菜单：`adminNavRegistry.ts` + pagepermission scan

### 小程序（若适用）

- [ ] `aroapp/miniprogram/**` API 与按钮规范（`aroapp-mini-ui-buttons.mdc`）

## 提示词示例

```text
目标模块：telemetry
新增表 telemetry_xxx 及 CRUD：
1. 按 skills/design/db-designer.yaml 交付 DDL
2. 按 skills/modules/telemetry/skill-telemetry.yaml 放置代码
3. Hub 相关改动需说明是否影响 GET /api/v1/telemetry/wincc/animal-room-hub
```
