# auth

## 模块结构

```mermaid
mindmap
  root((auth))
    AuthController
      POST /api/auth/login/web
      POST /api/auth/register/staff
      POST /api/auth/registration-invites/personal
      POST /api/auth/login/wechat
      POST /api/auth/session/refresh
      POST /api/auth/token/refresh
      ... +4 more
    AuthImpersonationController
      POST /api/auth/impersonate
    SpecialChannelController
      GET /api/auth/special-channel/pin-status
      POST /api/auth/special-channel/set-pin
      POST /api/auth/special-channel/login
      POST /api/auth/special-channel/admin/personnel/{userId}/reset-pin
    AuthService
      → UserMapper
      → UserDisplayNameService
      → JwtTokenService
    PasswordCredentialService
      → PasswordEncoder
    SpecialChannelService
      → AroPersonnelMapper
      → UserMapper
      → AuthService
      → PasswordEncoder
    StaffRegistrationService
      → UserMapper
      → AuthService
      → PasswordCredentialService
      → RegistrationInviteService
    StudentAccountProvisioner
      → JdbcTemplate
      → UserMapper
```

## API 清单

| 方法 | 路径 | 控制器 | 说明 |
|------|------|--------|------|
| POST | `/api/auth/login/web` | AuthController |  |
| POST | `/api/auth/register/staff` | AuthController |  |
| POST | `/api/auth/registration-invites/personal` | AuthController |  |
| POST | `/api/auth/login/wechat` | AuthController |  |
| POST | `/api/auth/session/refresh` | AuthController |  |
| POST | `/api/auth/token/refresh` | AuthController |  |
| POST | `/api/auth/bind/wechat` | AuthController |  |
| POST | `/api/auth/password/status` | AuthController |  |
| POST | `/api/auth/password/change` | AuthController |  |
| PATCH | `/api/auth/profile/display-nickname` | AuthController |  |
| POST | `/api/auth/impersonate` | AuthImpersonationController |  |
| GET | `/api/auth/special-channel/pin-status` | SpecialChannelController |  |
| POST | `/api/auth/special-channel/set-pin` | SpecialChannelController |  |
| POST | `/api/auth/special-channel/login` | SpecialChannelController |  |
| POST | `/api/auth/special-channel/admin/personnel/{userId}/reset-pin` | SpecialChannelController |  |
