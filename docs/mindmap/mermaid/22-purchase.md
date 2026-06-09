# purchase

## 模块结构

```mermaid
mindmap
  root((purchase))
    PurchaseOrderController
      GET /api/purchase/orders/recycle
      GET /api/purchase/orders/{id}
      POST /api/purchase/orders/{id}/withdraw
      POST /api/purchase/orders/recycle/{id}/restore
      POST /api/purchase/orders/recycle/purge
      DELETE /api/purchase/orders/{id}
      ... +4 more
    PurchaseOrderService
      → PurchaseOrderMapper
      → ObjectMapper
      → UserDisplayNameService
```

## 前端页面

| 路由 | 组件 | API 调用数 |
|------|------|-----------|
| `/purchase-request` | PurchaseRequestPage | 5 |
| `/purchase-process` | PurchaseProcessPage | 5 |

## API 清单

| 方法 | 路径 | 控制器 | 说明 |
|------|------|--------|------|
| GET | `/api/purchase/orders/recycle` | PurchaseOrderController |  |
| GET | `/api/purchase/orders/{id}` | PurchaseOrderController |  |
| POST | `/api/purchase/orders/{id}/withdraw` | PurchaseOrderController |  |
| POST | `/api/purchase/orders/recycle/{id}/restore` | PurchaseOrderController |  |
| POST | `/api/purchase/orders/recycle/purge` | PurchaseOrderController |  |
| DELETE | `/api/purchase/orders/{id}` | PurchaseOrderController |  |
| DELETE | `/api/purchase/orders/recycle/{id}` | PurchaseOrderController |  |
| DELETE | `/api/purchase/orders/recycle` | PurchaseOrderController |  |
| PATCH | `/api/purchase/orders/{id}/start` | PurchaseOrderController |  |
| PATCH | `/api/purchase/orders/{id}/complete` | PurchaseOrderController |  |
