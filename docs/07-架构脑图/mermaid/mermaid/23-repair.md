# repair

## 模块结构

```mermaid
mindmap
  root((repair))
    RepairOrderController
      GET /api/repair/orders/{id}
      GET /api/repair/orders/recycle
      POST /api/repair/orders/{id}/withdraw
      POST /api/repair/orders/recycle/{id}/restore
      POST /api/repair/orders/recycle/purge
      DELETE /api/repair/orders/{id}
      ... +4 more
    RepairOrderService
      → RepairOrderMapper
      → ObjectMapper
      → UserDisplayNameService
```

## 前端页面

| 路由 | 组件 | API 调用数 |
|------|------|-----------|
| `/repair-request` | RepairRequestPage | 5 |
| `/repair-process` | RepairProcessPage | 5 |

## API 清单

| 方法 | 路径 | 控制器 | 说明 |
|------|------|--------|------|
| GET | `/api/repair/orders/{id}` | RepairOrderController |  |
| GET | `/api/repair/orders/recycle` | RepairOrderController |  |
| POST | `/api/repair/orders/{id}/withdraw` | RepairOrderController |  |
| POST | `/api/repair/orders/recycle/{id}/restore` | RepairOrderController |  |
| POST | `/api/repair/orders/recycle/purge` | RepairOrderController |  |
| DELETE | `/api/repair/orders/{id}` | RepairOrderController |  |
| DELETE | `/api/repair/orders/recycle/{id}` | RepairOrderController |  |
| DELETE | `/api/repair/orders/recycle` | RepairOrderController |  |
| PATCH | `/api/repair/orders/{id}/start` | RepairOrderController |  |
| PATCH | `/api/repair/orders/{id}/complete` | RepairOrderController |  |
