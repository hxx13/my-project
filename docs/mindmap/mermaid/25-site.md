# site

## 模块结构

```mermaid
mindmap
  root((site))
    AdminSiteBrandingController
      GET /api/admin/site/login-branding
      POST /api/admin/site/login-branding/upload
      PUT /api/admin/site/login-branding
    PublicSiteController
      GET /api/public/login-branding
      GET /api/public/login-branding/files/{fileName}
    LoginBrandingUploadService
    SiteBrandingService
      → JdbcTemplate
      → ObjectMapper
```

## API 清单

| 方法 | 路径 | 控制器 | 说明 |
|------|------|--------|------|
| GET | `/api/admin/site/login-branding` | AdminSiteBrandingController |  |
| POST | `/api/admin/site/login-branding/upload` | AdminSiteBrandingController |  |
| PUT | `/api/admin/site/login-branding` | AdminSiteBrandingController |  |
| GET | `/api/public/login-branding` | PublicSiteController |  |
| GET | `/api/public/login-branding/files/{fileName}` | PublicSiteController |  |
