# accessrule

## 模块结构

```mermaid
mindmap
  root((accessrule))
    AccessRuleController
      GET /api/v1/access-rules/{id}
      PUT /api/v1/access-rules/{id}
      DELETE /api/v1/access-rules/{id}
    AccessRuleDispatchService
      → AccessRuleService
      → TwinCardMappingService
      → DahuaOpenApiService
      → TwinAccessRuleScanConfigService
    AccessRuleService
      → AccessRuleMapper
      → AccessRuleItemMapper
      → AccessRuleItemUserMapper
```

## API 清单

| 方法 | 路径 | 控制器 | 说明 |
|------|------|--------|------|
| GET | `/api/v1/access-rules/{id}` | AccessRuleController |  |
| PUT | `/api/v1/access-rules/{id}` | AccessRuleController |  |
| DELETE | `/api/v1/access-rules/{id}` | AccessRuleController |  |
