# adminfile

## 模块结构

```mermaid
mindmap
  root((adminfile))
    AdminFileTemplateController
      GET /api/admin/file-templates/{id}/download
      DELETE /api/admin/file-templates/{id}
    AdminFileTemplateService
      → AdminFileTemplateJdbcRepository
      → AdminFileTemplateLocalStorage
```

## API 清单

| 方法 | 路径 | 控制器 | 说明 |
|------|------|--------|------|
| GET | `/api/admin/file-templates/{id}/download` | AdminFileTemplateController |  |
| DELETE | `/api/admin/file-templates/{id}` | AdminFileTemplateController |  |
