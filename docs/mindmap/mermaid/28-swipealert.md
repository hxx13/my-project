# swipealert

## 模块结构

```mermaid
mindmap
  root((swipealert))
    SwipeAlertRuleController
      PUT /api/admin/swipe-alert/rules/{id}
      DELETE /api/admin/swipe-alert/rules/{id}
      PATCH /api/admin/swipe-alert/rules/{id}/toggle
    SwipeAlertEngine
      → SwipeAlertRuleMapper
```

## API 清单

| 方法 | 路径 | 控制器 | 说明 |
|------|------|--------|------|
| PUT | `/api/admin/swipe-alert/rules/{id}` | SwipeAlertRuleController |  |
| DELETE | `/api/admin/swipe-alert/rules/{id}` | SwipeAlertRuleController |  |
| PATCH | `/api/admin/swipe-alert/rules/{id}/toggle` | SwipeAlertRuleController |  |
