# policy

## 模块结构

```mermaid
mindmap
  root((policy))
    AdminCapabilityPolicyController
      PATCH /api/admin/settings/capability-policies/{bizDomain}
    CapabilityPolicyAdminService
      → BizCapabilityPolicyMapper
      → CapabilityPolicyService
      → JdbcTemplate
      → ObjectMapper
    CapabilityPolicyService
      → BizCapabilityPolicyMapper
```

## API 清单

| 方法 | 路径 | 控制器 | 说明 |
|------|------|--------|------|
| PATCH | `/api/admin/settings/capability-policies/{bizDomain}` | AdminCapabilityPolicyController |  |
