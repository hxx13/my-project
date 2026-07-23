# ARO CAS 个人Token绑定与API代理 — 实施计划

> 基于设计计划 `2026-07-23-ARO-CAS个人Token绑定与API代理-设计计划.md`  
> 最后更新: 2026-07-23

## 文件清单

### 新增文件

| 层 | 文件 | 说明 |
|----|------|------|
| 后端 | `modules/aro/client/CasClient.java` | CAS 协议通信接口 |
| 后端 | `modules/aro/client/CasClientImpl.java` | CAS 协议通信实现 |
| 后端 | `modules/aro/token/TokenStore.java` | Token 存储接口 |
| 后端 | `modules/aro/token/DbTokenStore.java` | DB Token 存储实现 |
| 后端 | `modules/aro/token/CachedTokenStore.java` | Token 缓存装饰器 |
| 后端 | `modules/aro/token/TokenSource.java` | Token 获取策略接口 |
| 后端 | `modules/aro/token/PersonalTokenSource.java` | 个人Token策略实现 |
| 后端 | `modules/aro/AroPersonalTokenClient.java` | 业务编排接口 |
| 后端 | `modules/aro/AroPersonalTokenClientImpl.java` | 业务编排实现 |
| 后端 | `modules/aro/dto/CasTokenInfo.java` | CAS Token DTO |
| 后端 | `modules/aro/dto/CasUserInfo.java` | CAS 用户身份 DTO |
| 后端 | `modules/auth/dto/CasLoginRequest.java` | CAS 登录请求 DTO |
| 前端 | `pages/AdminAroBindingPage.tsx` | ARO 认证管理页 |
| 前端 | `pages/login/CasLoginButton.tsx` | CAS 登录按钮组件 |
| 前端 | `pages/login/CasTicketReceiver.tsx` | Ticket 回调处理组件 |

### 修改文件

| 层 | 文件 | 改动 |
|----|------|------|
| 后端 | `modules/auth/controller/AuthController.java` | 新增 `POST /api/auth/login/cas` |
| 后端 | `modules/auth/service/AuthService.java` | 新增 `loginByCasIdentity()` |
| 后端 | `modules/admin/controller/AdminAccountBindingController.java` | 新增4个端点 |
| 后端 | `modules/aro/service/AroService.java` | `cachedToken` 加 `volatile` |
| 后端 | `modules/auth/entity/UserAroBinding.java` | 新增4字段 |
| 后端 | `resources/mapper/UserAroBindingMapper.xml` | 新增 UPDATE 方法 |
| 后端 | `modules/auth/mapper/UserAroBindingMapper.java` | 新增 Mapper 方法签名 |
| 后端 | `config/AroRestTemplateConfig.java` | 新增 `casRestTemplate` Bean |
| 后端 | `resources/db/user-aro-binding.sql` | ALTER TABLE |
| 前端 | `pages/LoginPage.tsx` | 新增"统一认证登录"按钮 + ticket 回调 |
| 前端 | `api/domains/auth.api.ts` | 新增 `loginCas()` |
| 前端 | `api/domains/admin.api.ts` | 新增 CAS 绑定 API 函数 |
| 前端 | `router/index.tsx` | 新增路由 `/admin/aro-binding` |
| 前端 | `features/admin/adminNavRegistry.ts` | 新增侧栏入口 |

---

## Phase 1: 数据库 + 实体

### 1.1 ALTER TABLE

```sql
ALTER TABLE user_aro_binding
  ADD COLUMN cas_token   TEXT        NULL COMMENT 'CAS换来的JWT(AES-256加密)',
  ADD COLUMN cas_token_exp BIGINT    NULL COMMENT 'Token过期Unix秒',
  ADD COLUMN cas_tgc      TEXT        NULL COMMENT 'CASTGC Cookie值(AES-256加密)',
  ADD COLUMN cas_account  VARCHAR(50) NULL COMMENT 'CAS账号名';
```

### 1.2 UserAroBinding.java

```java
// 新增字段
private String casToken;
private Long casTokenExp;     // Unix 秒
private String casTgc;
private String casAccount;
```

### 1.3 UserAroBindingMapper.xml

```xml
<update id="updateCasToken">
  UPDATE user_aro_binding
  SET cas_token = #{casToken}, cas_token_exp = #{casTokenExp}
  WHERE user_id = #{userId}
</update>

<update id="updateCasTgc">
  UPDATE user_aro_binding SET cas_tgc = #{casTgc} WHERE user_id = #{userId}
</update>

<update id="clearCasCredentials">
  UPDATE user_aro_binding
  SET cas_token = NULL, cas_token_exp = NULL, cas_tgc = NULL, cas_account = NULL
  WHERE user_id = #{userId}
</update>

<update id="upsertCasBinding">
  INSERT INTO user_aro_binding (user_id, aro_user_id, cas_token, cas_token_exp, cas_account, created_at)
  VALUES (#{userId}, #{aroUserId}, #{casToken}, #{casTokenExp}, #{casAccount}, NOW())
  ON DUPLICATE KEY UPDATE
    cas_token = VALUES(cas_token),
    cas_token_exp = VALUES(cas_token_exp),
    cas_account = VALUES(cas_account)
</update>
```

### 1.4 UserAroBindingMapper.java

```java
void updateCasToken(@Param("userId") String userId, @Param("casToken") String casToken, @Param("casTokenExp") Long casTokenExp);
void updateCasTgc(@Param("userId") String userId, @Param("casTgc") String casTgc);
void clearCasCredentials(@Param("userId") String userId);
void upsertCasBinding(@Param("userId") String userId, @Param("aroUserId") String aroUserId, @Param("casToken") String casToken, @Param("casTokenExp") Long casTokenExp, @Param("casAccount") String casAccount);
```

---

## Phase 2: CasClient — CAS 协议通信

### 2.1 casRestTemplate Bean

**文件**: `AroRestTemplateConfig.java`

```java
@Bean("casRestTemplate")
public RestTemplate casRestTemplate() {
    RestTemplate rt = new RestTemplate();
    // 不跟随302 — 拦截 ticket 提取的关键
    rt.setRequestFactory(new HttpComponentsClientHttpRequestFactory() {{
        setConnectTimeout(10000);
        setReadTimeout(15000);
    }});
    return rt;
}
```

**关键**: 必须配置为**不跟随 302 重定向**。默认的 `RestTemplate` 会自动跟随 302，导致直接跳转到 ARO 页面而无法拦截 ticket。使用 Apache HttpClient5 的 `HttpComponentsClientHttpRequestFactory` 并设置 `setFollowRedirects(false)` 不可用 — 需要替换为 `SimpleClientHttpRequestFactory` 或在 HttpClient5 层面配置。

**修正**: 使用 `SimpleClientHttpRequestFactory` 并配置 `HttpURLConnection.setInstanceFollowRedirects(false)`，或直接在 `exchange()` 时使用 `RequestCallback` 拦截。

**最终方案**: 在 `exchangeTicket` 和 `getServiceTicket` 方法中使用 `RestTemplate.execute(uri, HttpMethod.GET, null, responseExtractor)`，在 extractor 中检测 302 并提取 Location 头。

### 2.2 CasClient 接口

```java
public interface CasClient {
    // 调 ARO loginAuth 换 JWT (ARO内部已做serviceValidate)
    CasTokenInfo exchangeTicket(String ticket);

    // 调 CAS serviceValidate 直接获取用户身份(XML解析)
    CasUserInfo validateTicket(String ticket, String serviceUrl);

    // 用 CASTGC 换新 ticket
    String getServiceTicket(String tgc, String serviceUrl);

    // CAS 登出
    void logout();
}
```

### 2.3 CasClientImpl

**exchangeTicket**:
```
GET https://aro.shsmu.edu.cn/jtu/api/loginAuth?ticket={ticket}
→ 解析 JSON: { data: { token: "eyJ..." } }
→ 解析 JWT payload → CasTokenInfo { token, account, aroUserId, userKey, roleNames, exp }
→ JWT payload 解析使用 jjwt (项目已有)
```

**validateTicket**:
```
GET https://auth2.shsmu.edu.cn/cas/serviceValidate?service={serviceUrl}&ticket={ticket}
→ 解析 XML:
  <cas:user>YF0408</cas:user>
  <cas:username>位亚磊</cas:username>
  <cas:account>YF0408</cas:account>
  <cas:id>ff808081...</cas:id>
  <cas:email>YF0408@shsmu.edu.cn</cas:email>
  ...
→ CasUserInfo { user, username, account, id, email, phone, sex, usertype }
→ XML 解析使用 javax.xml.parsers.DocumentBuilder (JDK 内置)
```

**getServiceTicket**:
```
GET https://auth2.shsmu.edu.cn/cas/login?service={serviceUrl}
Header: Cookie: CASTGC={tgc}
→ 不跟随 302
→ 从 Location 响应头提取 ticket=ST-xxx
```

### 2.4 DTO

**CasTokenInfo**: `token, account, aroUserId, userKey, roleNames, exp (Unix秒)`

**CasUserInfo**: `user, username, account, id, email, phone, sex, usertype, eduid`

---

## Phase 3: TokenSource + TokenStore

### 3.1 TokenStore 接口

```java
public interface TokenStore {
    void save(String userId, CasTokenInfo tokenInfo);
    CasTokenInfo load(String userId);      // null if not found
    void delete(String userId);
    boolean exists(String userId);
}
```

### 3.2 DbTokenStore

```
save: AES-256 加密 token → upsertCasBinding
load: selectByUserId → AES-256 解密 → 还原 CasTokenInfo
delete: clearCasCredentials
```

加密密钥: `application.properties` 中 `app.aro.cas.encryption-key`（32字节 Base64）

### 3.3 CachedTokenStore (装饰器)

```
class CachedTokenStore implements TokenStore {
    private final TokenStore delegate;
    private final Cache<String, CasTokenInfo> cache;

    CachedTokenStore(TokenStore delegate) {
        this.cache = Caffeine.newBuilder()
            .maximumSize(200)
            .expireAfterWrite(30, TimeUnit.MINUTES)
            .build();
    }

    save(userId, tokenInfo) { delegate.save(); cache.put(userId, tokenInfo); }
    load(userId) { return cache.get(userId, k -> delegate.load(k)); }
    delete(userId) { delegate.delete(); cache.invalidate(userId); }
}
```

### 3.4 PersonalTokenSource

```java
public class PersonalTokenSource implements TokenSource {
    private final TokenStore tokenStore;
    private final CasClient casClient;

    @Override
    public String getToken(String userId) {
        CasTokenInfo info = tokenStore.load(userId);
        if (info == null) throw new AroTokenRequiredException("未绑定CAS账号");
        if (info.getExp() < System.currentTimeMillis() / 1000) {
            // Token 已过期 — 不自动续期，返回错误
            throw new AroTokenRequiredException("CAS Token已过期，请重新登录");
        }
        return info.getToken();
    }

    @Override
    public boolean isAvailable(String userId) {
        CasTokenInfo info = tokenStore.load(userId);
        return info != null && info.getExp() > System.currentTimeMillis() / 1000;
    }
}
```

---

## Phase 4: AroPersonalTokenClient

```java
public interface AroPersonalTokenClient {
    <T> T execute(String userId, Function<String, T> apiCall)
        throws AroTokenRequiredException;
}
```

```java
// 实现
execute(userId, apiCall):
    token = personalTokenSource.getToken(userId)
    // 无个人Token → 直接抛异常（不fallback共享Token）
    try:
        return apiCall.apply(token)
    catch 401:
        throw AroTokenRequiredException("ARO Token失效，请重新CAS登录")
```

---

## Phase 5: CAS 统一认证登录

### 5.1 后端: `POST /api/auth/login/cas`

**Request**: `{ ticket: "ST-xxx" }`

**处理流程**:

```java
@PostMapping("/login/cas")
public Result<?> loginCas(@RequestBody CasLoginRequest request) {
    // ① 调 ARO loginAuth 换 ARO JWT
    CasTokenInfo tokenInfo = casClient.exchangeTicket(request.getTicket());

    String aroUserId = tokenInfo.getAroUserId();  // ff808081...
    String account = tokenInfo.getAccount();        // YF0408

    // ② 存 ARO Token 到 user_aro_binding
    tokenStore.save(aroUserId, tokenInfo);

    // ③ 交叉匹配 aro_personnel（姓名 + 工号 双重验证）
    String casName = tokenInfo.getUserKey();     // 位亚磊
    String casAccount = tokenInfo.getAccount();   // YF0408
    AroPersonnel matched = aroPersonnelMapper.findByNameAndJobNumber(casName, casAccount);
    if (matched == null) {
        // 尝试只用工号匹配
        matched = aroPersonnelMapper.findByJobNumber(casAccount);
    }
    if (matched == null) {
        log.warn("CAS用户无人员库匹配 account={} name={}", casAccount, casName);
        return Result.fail(403,
            "未在人员库中找到匹配记录（账号: " + casAccount +
            "，姓名: " + casName +
            "）。请联系管理员将您的信息录入人员库。");
    }

    // ④ 查 sys_user（人员库已映射，不自动创建）
    String matchedUserId = matched.getUserId();  // aro_personnel.user_id = sys_user.id
    User user = userMapper.findById(matchedUserId);
    if (user == null) {
        log.warn("人员库匹配但无系统账号 name={} account={} userId={}",
            casName, casAccount, matchedUserId);
        return Result.fail(403,
            "您在人员库中有记录（" + casName + "，" + casAccount +
            "），但系统账号尚未开通。请联系管理员开通后再试。");
    }

    // ⑤ 检查账号状态
    if (user.getStatus() != null && user.getStatus() == 0) {
        return Result.fail(403, "账号已被禁用，请联系管理员");
    }

    // ⑥ 签发 our JWT（使用已有 role，不修改）
    return authService.generateAuthResult(user);
}
```

**匹配规则（不自动创建账号）**：

```
CAS identity: name + account
       │
 ① 查 aro_personnel WHERE name=? AND job_number=?
       │
 ② 匹配成功 → user_id → sys_user WHERE id=user_id
       │
 ③ sys_user存在+status=1 → 签发JWT（保持原role）
 ③ sys_user不存在      → 拒绝："系统账号尚未开通"
 ③ status=0            → 拒绝："账号已被禁用"
       │
 ② name+jobNumber都不匹配 → 仅jobNumber重试
 ② 都不匹配             → 拒绝："未在人员库中找到"
```

**不自动创建账号**。CAS 登录仅匹配已有人员库映射 + 已开通系统账号的用户。新用户需通过管理后台 `/admin/personnel` 先录入人员库并开通账号。

### 5.2 前端: LoginPage 修改

**CasLoginButton**: 在登录抽屉中新增按钮，`onClick` 跳转 CAS:

```
https://auth2.shsmu.edu.cn/cas/login?service=https://我们的域名/login
```

**CasTicketReceiver**: `useEffect` 中检测 ticket:

```typescript
useEffect(() => {
  const ticket = new URLSearchParams(window.location.search).get('ticket');
  if (!ticket) return;
  (async () => {
    const data = await loginCas(ticket);
    authStorage.setAuth(data.token, data.role, data.userInfo);
    authStorage.markLoginPortal("staff");
    window.history.replaceState({}, '', '/#/login');
    const target = await resolvePostLoginTarget({...});
    navigate(target, { replace: true });
  })();
}, []);
```

### 5.3 前端: auth.api.ts

```typescript
export async function loginCas(ticket: string): Promise<AuthData> {
  const response = await axios.post<Result<AuthData>>("/api/auth/login/cas", { ticket });
  if (!response.data?.success || !response.data?.data?.token) {
    throw new Error(response.data?.message || "CAS登录失败");
  }
  return response.data.data;
}
```

---

## Phase 6: 后台 ARO 认证页面

### 6.1 Controller 端点

全部在 `AdminAccountBindingController` 中新增:

```
POST   /api/admin/account/binding/cas-bind    { ticket } → 绑定
GET    /api/admin/account/binding/cas-status  → 状态
POST   /api/admin/account/binding/cas-renew   → 续期
DELETE /api/admin/account/binding/cas-unbind  → 解绑
```

权限: 仅 ADMIN+

### 6.2 前端 AdminAroBindingPage

```
AdminAroBindingPage
  ├─ CAS登录用户（已绑定） → AroBindingStatusCard: "已绑定: YF0408, 剩余29天"
  │                          └─ TokenExpiryCountdown + UnbindConfirmDialog
  │
  └─ 密码登录用户（未绑定） → "未绑定" + CasLoginButton
                               └─ 跳转 CAS → ticket 回到此页 → CasTicketReceiver 调后端绑定
```

### 6.3 路由 + 导航

- 路由: `{ path: "aro-binding", element: <AdminAroBindingPage /> }` (AdminGuard 内)
- Nav entry: `id=aro-binding, path=/admin/aro-binding, label=ARO 认证, icon=KeyRound, fallbackMinRole=ADMIN`
- sidebarVisible: `(ctx) => show(ctx, "/admin/aro-binding", "ADMIN")`

---

## Phase 7: AroService 微调

```java
// cachedToken 加 volatile — 修已有的多线程可见性 bug
private volatile String cachedToken = null;
```

现有方法签名不变，保持向后兼容。

---

## 验证清单

| # | 验证项 | 预期结果 |
|---|--------|---------|
| 1 | `./mvnw compile` | 通过 |
| 2 | `npx tsc --noEmit` | 通过 |
| 3 | LoginPage 出现"统一认证登录"按钮 | ✅ |
| 4 | 点击 → 跳转 CAS 登录 | ✅ |
| 5 | 输入 YF0408 + 密码 + 验证码 → 回到 LoginPage | ✅ |
| 6 | 自动调 `/api/auth/login/cas` → 进入系统 | ✅ |
| 7 | 后台 `/admin/aro-binding` 显示"已绑定: YF0408" | ✅ |
| 8 | 用 CAS Token 调 ARO `/ucenter` → 200 | ✅ |
| 9 | aro_personnel 无记录时 CAS 登录被拒绝 | ✅ 403 + 提示信息 |
| 10 | 密码登录 → 后台页面显示"未绑定" → 可手动绑定 | ✅ |
| 11 | 解绑 → ARO Token 清除 → 不影响登录态 | ✅ |

## 复核修正记录

| # | 问题 | 修正 |
|---|------|------|
| H1 | cachedToken 非 volatile | Phase 7 加 volatile |
| H2 | 无个人Token时 fallback 共享Token | Phase 4: 直接抛异常，不fallback |
| H3 | localUserId 由调用方传入 | Phase 4: 从 AuthContextService 获取 |
| H4 | 明文存 Token | Phase 3.2: AES-256 加密 |
| M1 | 续期竞态 | DB upsert 原子操作 + Caffeine 缓存 |
| M2 | 每次查 DB | Phase 3.3: CachedTokenStore |
| M3 | 302拦截需独立 RestTemplate | Phase 2.1: casRestTemplate |
| M4 | cas_tgc VARCHAR(512) | Phase 1.1: TEXT |
| M5 | hash-router ticket 提取 | Phase 5.2: window.location.search |
| N1 | CAS 登录 aro_personnel 无记录 | Phase 5.1: 403 + 详细提示 |

---

## 第二轮复核记录（2026-07-23，3 Agent 交叉审查）

### CRITICAL（实施前必须修正）

| # | 来源 | 问题 | 修正 |
|---|------|------|------|
| R1 | A | **hash-router ticket 提取**：`window.location.search` 不可用。SPA 使用 `createHashRouter`，CAS 回调 `?ticket=ST-xxx` 在 hash 之前可能丢失 | 改为从 `window.location.hash` 提取，或让 CAS service 指向 `/#/login?ticket_will_come_before_hash` |
| R2 | B | **Caffeine 不在 pom.xml** | 加依赖 `com.github.benmanes.caffeine:caffeine` |
| R3 | B | **302拦截方案不可行**：`ResponseExtractor` 收不到302（HttpClient 层已跟随重定向） | 创建 `CloseableHttpClient` 并 `.disableRedirectHandling()` → 传给 `HttpComponentsClientHttpRequestFactory` → 给 `casRestTemplate` |
| R4 | C | **`sys_user.id` 来源错误**：计划写入"ff808081..."（CAS hex id），实际 ARO JWT `userId` 是19位数字 | `aroUserId` 从 ARO JWT 的 `userId` claim 解析（19位数字），非 CAS XML 的 `<cas:id>`。修正所有相关注释 |
| R5 | C | **H3 未实际修复**：复核记录声称"从 AuthContextService 获取"，但 Phase 4 接口仍有 `userId` 参数 | `execute()` 移除 `userId` 参数，内部通过 `AuthContextService.getCurrentUserId()` 获取 |
| R6 | A | **useEffect 无错误处理**：`loginCas` 失败时 unhandled rejection | 加 `try/catch` + `toast.error()` |
| R7 | A | **Strict Mode 双重触发**：React 18 会 mount→unmount→remount，ticket 被消费两次 | 加 `useRef` 守卫，确保只执行一次 |

### HIGH

| # | 来源 | 问题 | 修正 |
|---|------|------|------|
| R8 | C | **自动创建用户角色不匹配**：`role=MEMBER`（学生）对教职工系统不合适 | 改为 `role=STAFF`（普通员工），或从 ARO JWT `roleNames` 推断 |
| R9 | C | **绑定流 CAS service URL 未定义**：密码用户手动绑定的 service 参数应该指向哪个页面？ | 约定为 `/#/admin/aro-binding`，CAS service 使用 `{域名}/#/admin/aro-binding` |
| R10 | B | **`AroTokenRequiredException` 类不存在** | 新建，继承 `TwinBusinessException`，注册到 GlobalExceptionHandler |
| R11 | A | **`loginCas` 未导入 LoginPage.tsx** | 加 import |
| R12 | B | **已禁用用户可 CAS 登录** | `loginCas` 中加 `status == 0` 检查，返回 403 |

### MEDIUM

| # | 来源 | 问题 | 修正 |
|---|------|------|------|
| R13 | B | **并发 loginCas 创建同一用户**：两个请求同时 INSERT 会 DuplicateKeyException | 用 `INSERT IGNORE` 或 try-catch |
| R14 | B | **`upsertCasBinding` 缺 `cas_tgc`** | ON DUPLICATE KEY UPDATE 加 `cas_tgc = VALUES(cas_tgc)` |
| R15 | C | **`cas-renew` 端点列了但无实现** | 明确延期到 Phase 2，或移除本计划 |
| R16 | C | **AES 加密模式未指定** | 推荐 AES-256-GCM，随机 12-byte IV 前置 |
| R17 | A | **`window.history.replaceState` + `navigate` 冗余** | 去掉 replaceState，由 navigate 自然替换 URL |
| R18 | A | **Nav group 位置未指定** | 放在 `aro-room-link` group |
| R19 | C | **`aup` 导入缺失** | 加 `KeyRound` 到 lucide-react import |
| R20 | A | **AdminAroBindingPage 缺 loading/error 状态** | 加三种态：loading skeleton / error toast / empty "未绑定" |
| R21 | C | **CasTicketReceiver 双上下文不清**：LoginPage 用 `login/cas`，AdminPage 用 `cas-bind` | 拆为两个 hooks: `useCasLogin(ticket)` 和 `useCasBind(ticket)` |

### LOW

| # | 来源 | 问题 | 修正 |
|---|------|------|------|
| R22 | B | `Base_Column_List` 未更新 | 加 4 个新字段 |
| R23 | B | 服务端时钟偏差影响 exp 检查 | `isAvailable` 留 30s 余量 |
| R24 | C | 设计文档残留 L5 重复行 | 删除 line 322 的孤立行 |
| R25 | C | `authProfile` 值（`WEB_PASSWORD` vs `ARO_BOUND`）不统一 | CAS 用户用 `CAS_LOGIN` 标识 |
| R26 | A | CAS URL 硬编码 | 先硬编码，后续迁移到 runtime config |
