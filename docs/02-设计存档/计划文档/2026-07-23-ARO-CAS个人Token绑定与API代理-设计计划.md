# ARO CAS 个人Token绑定与API代理 — 设计计划

## 背景

当前系统通过一个共享ARO账号（`AroService.cachedToken`）调用ARO后台接口。该Token权限固定，无法区分操作用户身份。需要支持用户绑定自己的CAS统一认证账号，系统存储个人JWT Token，在需要个人权限的ARO API调用时自动切换Token。

## Token 链条（关键，防混淆）

```
CAS页面 (auth2.shsmu.edu.cn)
  │  用户手动输入 YF0408 + 密码 + 验证码
  │  无service参数 → 登录成功 → 设置 CASTGC Cookie
  │
  ├─[续期]─ 带CASTGC → CAS?service=... → 302 → Location含ticket(ST-xxx)
  │                                                    │
  │            ┌──── ARO后端的内部处理（我们看不到）─────┤
  │            │                                       │
  │            │  GET /cas/serviceValidate?ticket=ST-xxx&service=...
  │            │  → 返回 XML 含用户身份:                │
  │            │    <cas:user>YF0408</cas:user>          │
  │            │    <cas:username>位亚磊</cas:username>   │
  │            │    <cas:email>YF0408@shsmu.edu.cn</...>  │
  │            │    <cas:id>ff808081...</cas:id>          │
  │            │  → ARO 用 CAS 身份查/建本地用户        │
  │            │  → 签发 JWT（userId,roleNames来自本地DB）│
  │            │                                       │
  │            └───────────────────────────────────────┤
  │                                                    │
  │     GET /jtu/api/loginAuth?ticket=ST-xxx           │
  │     → ARO 内部已调用 serviceValidate 验证完毕       │
  │     → 返回 { data: { token: "eyJ..." } }           │
  │                                                    │
  │                ┌───────────────────────────────────┤
  │                │                                   │
  │       【个人Token】                          【共享Token】
  │       存在 user_aro_binding                  AroService.cachedToken
  │       每个用户不同                            全系统同一个
  │       用于: 权限敏感操作                      用于: 公开数据拉取
  │       (房间权限修改/培训审批等)                (人员列表/新闻/字典等)
  │                │
  │       Token过期 → CASTGC续期 → 新ticket → loginAuth换新JWT
  │       如CASTGC也过期 → 前端提示重新CAS登录
  │
  └─[退出]─ CAS/logout → 销毁CASTGC → 移除绑定
```

**关键认知**：`/jtu/api/loginAuth?ticket=xxx` 不是黑盒。ARO 后端内部先调 CAS `serviceValidate` 拿用户身份（XML），再用 CAS 身份匹配本地用户 → 签发 JWT。JWT 中的 `account`/`userKey` 来自 CAS，`userId`/`roleNames`/`permissionUrls` 来自 ARO 本地 DB。

## 架构（组件化分层）

### 调用方视角（业务代码只和这一行打交道）

```java
// 需要个人权限的 ARO 操作
aroPersonalTokenClient.execute(userId, token -> aroApi.fetchSensitiveData(token));

// 公开数据的 ARO 操作（不需要个人身份）
aroSharedTokenClient.execute(token -> aroApi.fetchPublicData(token));
```

### 后端组件拆分

```
┌──────────────────────────────────────────────────────────┐
│  AroPersonalTokenClient (接口)                           │
│  - execute(userId, Consumer<String>) → 自动选Token       │
│  └─ 实现: AroPersonalTokenClientImpl                     │
└──────────────┬───────────────────────────────────────────┘
               │ 依赖接口，不依赖实现
    ┌──────────┼──────────┐
    │          │          │
    ▼          ▼          ▼
TokenSource  TokenStore  CasClient
(获取Token)  (存储/缓存) (CAS协议通信)
    │          │          │
    │          │          │
接口:        接口:       接口:
TokenSource  TokenStore  CasClient
    │          │          │
实现:        实现:       实现:
├─SharedTokenSource     ├─DbTokenStore       CasClientImpl
│ (从AroService拿共享)   │ (user_aro_binding)  ├─ exchangeTicket(ticket)
│                       │ + AES-256加密       ├─ getServiceTicket(tgc, service)
└─PersonalTokenSource   │ + Caffeine缓存      └─ logout()
  (从TokenStore读取)     └─CachedTokenStore
                          (Caffeine装饰器)
```

**各组件职责**：

| 组件 | 接口 | 实现 | 职责 |
|------|------|------|------|
| `TokenSource` | `getToken(userId): String` | `SharedTokenSource`, `PersonalTokenSource` | 统一获取 Token，调用方不关心来源 |
| `TokenStore` | `save/load/delete(userId)` | `DbTokenStore` + `CachedTokenStore` | Token 持久化 + 缓存，透明加密 |
| `CasClient` | `exchangeTicket(ticket)`, `getServiceTicket(tgc, service)`, `logout()` | `CasClientImpl` | CAS 协议封装，专用 RestTemplate |
| `AroPersonalTokenClient` | `execute(userId, fn)` | `AroPersonalTokenClientImpl` | 编排层：TokenSource → 调 ARO → 401 → 续期 → 重试 |

### 前端组件拆分

```
AdminAroBindingPage
  ├─ AroBindingStatusCard     ←  纯展示: 已绑定/未绑定/帐号/有效期
  ├─ CasLoginButton           ←  CAS 跳转链接 + 新窗口管理
  ├─ CasTicketReceiver        ←  从 URL 提取 ticket → 调后端绑定
  ├─ TokenExpiryCountdown     ←  倒计时 + <1h 警告 + 续期按钮
  └─ UnbindConfirmDialog      ←  解绑确认 + CAS logout 跳转
```

**各组件接口**：

| 组件 | Props/Events | 说明 |
|------|-------------|------|
| `AroBindingStatusCard` | `status: {bound, account, expiresAt}` | 纯展示 |
| `CasLoginButton` | `onClick → window.location` | 跳 CAS 登录 |
| `CasTicketReceiver` | `onTicket(ticket) → apiCall` | mount 时读 `window.location.search` |
| `TokenExpiryCountdown` | `expiresAt, onRenew` | 每秒更新 |
| `UnbindConfirmDialog` | `open, onConfirm, onCancel` | 弹窗确认 |

### 扩展性

```
未来新增 Token 来源:

  TokenSource (接口不变)
    ├─ SharedTokenSource     (已有)
    ├─ PersonalTokenSource   (已有，CAS)
    └─ OAuthTokenSource      (未来，OAuth2)
    └─ WechatTokenSource     (未来，微信)

未来新增存储方式:

  TokenStore (接口不变)
    ├─ DbTokenStore           (已有)
    └─ RedisTokenStore        (未来，分布式)
```

### 三层 Token 区分（防混淆）

```
请求全链路:

  浏览器                        我们的后端                    ARO 后端
  ──────                        ────────                    ───────
  Authorization: Bearer <我们JWT>  →  验证身份              收到 token: <共享或个人JWT>
                                   │                           │
                                   ├─ 公开数据 → 共享Token      │
                                   └─ 敏感操作 → 个人Token      │

  我们JWT 的作用: 识别"谁在操作我们的系统"
  ARO Token 的作用: 告诉ARO"以什么身份访问ARO"
```

| Token | Key | 存储 | 谁签发 | 谁验证 |
|-------|-----|------|--------|--------|
| 我们 JWT | `Authorization: Bearer` | 浏览器 localStorage | 我们后端 | 我们后端 |
| 共享 ARO Token | `token:` (ARO头) | `AroService.cachedToken` | ARO /login | ARO 后端 |
| 个人 CAS Token | `token:` (ARO头) | `user_aro_binding.cas_token` | ARO loginAuth | ARO 后端 |
  │                                                      └─ unbind(userId)
  │
  │  业务API调用时                                       AroService (修改)
  │                                                      └─ executeWithPersonalToken(userId, request)
  │                                                         优先个人Token，无则fallback共享Token
```

## 数据模型

### user_aro_binding 表扩展

| 字段 | 类型 | 说明 |
|------|------|------|
| cas_token | TEXT | CAS换来的JWT |
| cas_token_exp | DATETIME | Token过期时间 |
| cas_tgc | VARCHAR(512) | CASTGC Cookie值（续期用） |
| cas_account | VARCHAR(50) | CAS账号名（如YF0408） |

原有字段 `user_id`, `aro_user_id` 保持不变。

## CAS跳转链接

- 登录（获取TGC）：`https://auth2.shsmu.edu.cn/cas/login`
- 续期（用TGC换ticket）：`https://auth2.shsmu.edu.cn/cas/login?service=https%3A%2F%2F你的回调地址`
- 登出（销毁TGC）：`https://auth2.shsmu.edu.cn/cas/logout`

## 改动范围

### 后端

| 文件 | 操作 | 说明 |
|------|------|------|
| `modules/aro/service/AroUserTokenService.java` | 新增 | Token换取/存储/续期/解绑 |
| `modules/admin/controller/AdminAccountController.java` | 修改 | 新增3个端点 |
| `modules/aro/service/AroService.java` | 修改 | 新增个人Token优先调用方法 |
| `db/user-aro-binding.sql` | 修改 | 加4个字段 |

### 前端

| 文件 | 操作 | 说明 |
|------|------|------|
| `pages/AdminAroBindingPage.tsx` | 新增 | CAS绑定管理页 |
| `router/index.tsx` | 修改 | 新增路由 |
| `features/admin/adminNavRegistry.ts` | 修改 | 新增侧栏入口 |
| `api/domains/admin.api.ts` | 修改 | 新增3个API函数 |

## Token使用规则

| API类型 | 使用Token | 示例 |
|---------|----------|------|
| 公开数据 | 共享Token | 人员列表、新闻、字典 |
| 权限敏感 | 个人Token（无则拒绝） | 房间权限修改、培训审批 |
| CAS操作 | 无需认证 | loginAuth |

## 安全考虑

- CASTGC Cookie通过HttpOnly传输，不暴露给前端JS
- 个人JWT仅在后端存储和使用，前端不接触
- Token续期后端完成，前端仅触发
- 解绑时同步调用CAS logout销毁CASTGC

## 复核记录（2026-07-23，3 Agent 并行审查）

### 高风险项（必须修复后再实施）

| # | 问题 | 修复方向 |
|---|------|---------|
| H1 | `AroService.cachedToken` 非 volatile，多线程可见性 bug | 加 `volatile` 或改 `AtomicReference` |
| H2 | `executeWithPersonalToken` 无个人Token时静默 fallback 共享Token，违背权限隔离设计 | 权限敏感操作无个人Token时直接拒绝，不 fallback |
| H3 | `executeWithPersonalToken` 接受调用方传入 `localUserId`，无法防止跨用户误用 | 改为从 `AuthContextService` 内部获取当前用户 |
| H4 | `cas_token`/`cas_tgc` 明文存数据库 | 加 AES-256 列级加密 |

### 中风险项（实施时注意）

| # | 问题 | 修复方向 |
|---|------|---------|
| M1 | Token 续期无并发控制，两请求同时续期会竞态 | `SELECT ... FOR UPDATE` 或 DB 行锁 |
| M2 | 每次 `getTokenForUser()` 都查 DB，高频场景性能瓶颈 | 加 Caffeine/ConcurrentHashMap 本地缓存 + TTL |
| M3 | `renewToken` 拦截302需要不跟随重定向的 RestTemplate，不能共用 `aroRestTemplate` | 新建 `casRestTemplate` bean，配置 `setFollowRedirects(false)` |
| M4 | `cas_tgc` VARCHAR(512) 可能不够 | 改为 TEXT |
| M5 | Hash-Router SPA 下 CAS ticket 在 `window.location.search` 而非 hash 内，`useSearchParams()` 不可用 | 用 `new URLSearchParams(window.location.search)` 提取 |

### 低风险项（文档/命名修正）

| # | 问题 | 修复方向 |
|---|------|---------|
| L1 | Controller 类名实际是 `AdminAccountBindingController`，非 `AdminAccountController` | 对齐实际类名 |
| L2 | `renewToken` API 架构图有但 Phase 2.2 代码未列出 | 补充实现 |
| L3 | 前端验证步骤说"手动复制 ticket"，与设计说"自动提取"矛盾 | 统一为自动提取（从 `window.location.search`） |
| L4 | UserAroBinding 实体和 Mapper XML 需新增 4 字段 + UPDATE 方法 | 补充 Mapper |
| L5 | `cas_token_exp` 存储类型应为 `DATETIME`，与 JWT `exp`（Unix timestamp）需做转换 | 统一用 BIGINT 存 Unix 秒 |

---

## CAS 统一认证登录（LoginPage 集成）

### 双路径设计

```
LoginPage
  │
  ├── "账号密码登录" (已有)
  │     POST /api/auth/login/web { username, password }
  │     → our JWT → 进入系统
  │     └─ 进入后到 "ARO 认证" 页面手动绑定 CAS
  │         → 跳转 CAS 登录 → 换 ARO JWT → 存入 user_aro_binding
  │
  └── "统一认证登录" (新增)
        跳转 CAS → 用户填验证码 → 回调 ?ticket=ST-xxx
        → POST /api/auth/login/cas { ticket }
        → 后端一次性完成:
           ① 调 loginAuth 换 ARO JWT → 存入 user_aro_binding.cas_token
           ② 解析 ARO JWT 拿 identity（account, userId）
           ③ 交叉匹配 sys_user → 登录或自动创建
           ④ 签发 our JWT
        → 前端 authStorage.setAuth() → 进入系统
        → 后台 "ARO 认证" 页显示 "已绑定: YF0408"
```

### CAS 登录 API: `POST /api/auth/login/cas`

**Request**: `{ ticket: "ST-xxx", service: "https://我们的回调URL" }`

**后端处理流程**:

```
① GET /jtu/api/loginAuth?ticket=ST-xxx
   → ARO 返回 { token: "ARO_JWT" }

② 解析 ARO_JWT payload → { account, userId, userKey, roleNames }

③ 存 ARO Token:
   user_aro_binding WHERE user_id = <CAS userId>
   → INSERT 或 UPDATE cas_token, cas_token_exp, cas_account

④ 交叉匹配 aro_personnel（姓名 + 工号 双重验证）:
   WHERE name = <cas:username 位亚磊> AND job_number = <cas:account YF0408>
   ├─ 匹配成功 → user_id → sys_user WHERE id = user_id
   │   ├─ 存在 + status=1 → 用已有 role 签发 our JWT
   │   ├─ 不存在 → 返回 "系统账号尚未开通"
   │   └─ status=0 → 返回 "账号已被禁用"
   ├─ name+jobNumber 都不匹配 → 仅 jobNumber 重试
   └─ 都不匹配 → 返回 "未在人员库中找到"
   
   不自动创建 sys_user。CAS 登录仅匹配已有映射的用户。

⑤ 返回 AuthData { token, role, userInfo }
```

### 与账号密码登录的账号创建差异

| 场景 | 账号密码登录 | CAS 登录 |
|------|-------------|---------|
| sys_user 已存在 + 密码匹配 | 验证密码 → 登录 | — |
| sys_user 已存在 + CAS 匹配 | — | 跳过密码 → 登录 |
| sys_user 不存在 | 不支持（需先注册） | **不自动创建**，提示"系统账号尚未开通" |
| aro_personnel 无匹配 | — | 拒绝，提示"未在人员库中找到" |

**CAS 登录不做账号创建**，只匹配已有人员库映射。新用户需通过管理后台 `/admin/personnel` 先录入。

### CAS 回调 URL 设计

CAS 登录的 `service` 参数设为 `https://我们的域名/login`（LoginPage）。
LoginPage 的 `useEffect` 检测 `window.location.search` 中存在 `ticket=` 时，
自动调 `POST /api/auth/login/cas` 完成登录，不走密码表单。

### 后台 "ARO 认证" 页面的角色变化

- **CAS 登录用户**: 页面显示 "已绑定: YF0408, 剩余29天" + 解绑按钮（无需再手动绑定）
- **密码登录用户**: 页面显示 "未绑定" + "绑定 CAS" 按钮 → 跳转 CAS → 回调到此页 → 调绑定 API（不涉及登录）
- 解绑后: 仅清空 ARO Token，不影响 our JWT 登录态
| L5 | `cas_token_exp` 存储类型应为 `DATETIME`，与 JWT `exp`（Unix timestamp）需做转换 | 统一用 Unix 秒存储或转换 |
