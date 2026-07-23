# ARO CAS 统一认证对接指南

## 概述

ARO（实验动物管理系统）使用上海交通大学医学院 CAS（Central Authentication Service）作为统一身份认证。本文档记录 CAS 登录的完整链路、JWT Token 机制，以及"代登录"的实现方案。

## 环境信息

| 系统 | 地址 |
|------|------|
| ARO 前端 | `https://aro.shsmu.edu.cn` |
| ARO 后端 API | `https://aro.shsmu.edu.cn/jtu/api/` |
| CAS 认证中心 | `https://auth2.shsmu.edu.cn/cas/` |

---

## 一、ARO 的两种登录方式

### 1.1 账号密码登录

ARO 本地账号体系，直接请求后端接口。

```
POST /jtu/api/login
Content-Type: application/json

{"account": "15001771038", "password": "88888888"}

Response:
{
  "data": { "token": "eyJ..." },
  "status": 0
}
```

特点：
- 无需验证码
- 需要 ARO 本地账号（手机号/工号 + 密码）
- Token 有效期 30 天

### 1.2 统一认证登录（CAS SSO）

上海交通大学医学院统一身份认证，需要浏览器交互。

#### 完整链路

```
① 前端跳转 CAS
   https://auth2.shsmu.edu.cn/cas/login?service=https%3A%2F%2Faro.shsmu.edu.cn%2F%23%2Fjtu%2Fapi%2FloginAuth
   注意: service 参数中的 # 必须 URL-encode 为 %23

② 用户在 CAS 页面输入
   - 账号（如 YF0408）
   - 密码
   - 验证码（89×30 图片验证码，服务端硬校验）

③ CAS 验证通过，302 重定向回 ARO
   https://aro.shsmu.edu.cn/?ticket=ST-310117-xxx#/jtu/api/loginAuth

④ ARO 后端用 ticket 向 CAS 验证身份
   GET https://auth2.shsmu.edu.cn/cas/serviceValidate?service=...&ticket=ST-310117-xxx
   → 返回 XML 包含用户身份（账号、姓名、邮箱、手机等）
   → 这是关键的服务端调用，浏览器不可见（详见第三章）

⑤ ARO 后端根据 CAS 返回的身份查数据库 → 签发 JWT

⑥ ARO 前端从 URL 提取 ticket，调用换 Token
   GET /jtu/api/loginAuth?ticket=ST-310117-xxx

   Response:
   {
     "data": { "token": "eyJ..." },
     "status": 0
   }
```

CAS Ticket 格式: `ST-{timestamp}-{random}-TyrZ`（如 `ST-310117-H4cnuwaDdATPl7voMP21-TyrZ`）

---

## 二、JWT Token 结构

算法: `HS512` (HMAC-SHA512)

```json
{
  "alg": "HS512"
}
{
  "sub": "1935162605895184385",
  "dataScopes": [3, 3],
  "permissionUrls": ["/iacuc", "#", "/aup", "#", ...],
  "exp": 1787368618,
  "userId": 1935162605895184385,
  "roleNames": ["apply", "breeding_manager"],
  "iat": 1784776618,
  "account": "YF0408",
  "userKey": "位安顺"
}
```

字段说明:

| 字段 | 说明 |
|------|------|
| `sub` | 用户唯一 ID |
| `account` | 工号 |
| `userKey` | 姓名（UTF-8 编码可能乱码） |
| `roleNames` | 角色列表（如 pi, admin, apply, vet 等） |
| `dataScopes` | 数据权限范围 |
| `permissionUrls` | URL 权限白名单 |
| `exp` | 过期时间（Unix timestamp，签发后约 30 天） |
| `iat` | 签发时间 |

### Token 存储和传递

- 前端存储: `localStorage.token`
- API 请求头: `token: <jwt>`（注意不是 `Authorization: Bearer`）

---

## 三、CAS Ticket 验证 — 用户身份获取（核心）

这是整个 CAS 登录链路中最关键的环节。ARO 后端拿到 ticket 后，通过调用 CAS 的 `serviceValidate` 接口来验证 ticket 并获取用户身份。此调用是服务端到服务端的，浏览器不可见。

### 3.1 请求

```
GET https://auth2.shsmu.edu.cn/cas/serviceValidate?service={service}&ticket={ticket}
```

- `service`: ARO 回调地址，必须与获取 ticket 时使用的 service 一致
- `ticket`: CAS 签发的 ST（Service Ticket）

> **注意**：CAS 同时提供 `/cas/validate`（CAS 1.0）和 `/cas/serviceValidate`（CAS 2.0）。`validate` 仅返回 `yes`/`no`，不返回用户属性；ARO 使用的是 `serviceValidate`。

### 3.2 响应（XML）

```xml
<cas:serviceResponse xmlns:cas='http://www.yale.edu/tp/cas'>
  <cas:authenticationSuccess>
    <cas:user>YF0408</cas:user>
    <cas:attributes>
      <cas:id>ff8080819685f81e0196f21db99833db</cas:id>
      <cas:sex>1</cas:sex>
      <cas:username>位亚磊</cas:username>
      <cas:email>YF0408@shsmu.edu.cn</cas:email>
      <cas:account>YF0408</cas:account>
      <cas:usertype>10</cas:usertype>
      <cas:eduid>335ca685-013e-5c1f-b638-bf93fb19b7fc</cas:eduid>
      <cas:my_phone>18004490133</cas:my_phone>
    </cas:attributes>
  </cas:authenticationSuccess>
</cas:serviceResponse>
```

### 3.3 属性字段说明

| CAS 字段 | 说明 | 对应 ARO JWT/用户字段 |
|----------|------|----------------------|
| `cas:user` | 登录账号/工号 | `account` |
| `cas:username` | 中文姓名 | `userKey`（姓名）、`ucenter.name` |
| `cas:id` | CAS 内部用户 ID | 用于关联 |
| `cas:account` | 工号（与 user 相同） | `account` |
| `cas:email` | 邮箱 | `ucenter.email` |
| `cas:sex` | 性别（1=男） | `ucenter.gender` |
| `cas:usertype` | 用户类型（10=工作人员） | `ucenter.userClassId` |
| `cas:my_phone` | 手机号 | `ucenter.mobilePhone` |
| `cas:eduid` | 教育 ID（UUID） | — |

### 3.4 ARO 后端的处理流程

```
CAS serviceValidate 返回 XML
        │
        ▼
ARO 解析 XML 提取 account、username 等
        │
        ▼
用 account 或 id 查本地数据库
  ├─ 已存在 → 更新用户信息
  └─ 不存在 → 创建本地用户记录
        │
        ▼
用本地用户数据签发 JWT（userId、roleNames、dataScopes 等来自本地 DB）
        │
        ▼
返回 JWT 给前端
```

**关键结论**：JWT 中的 `account`/`userKey` 来自 CAS，但 `userId`、`roleNames`、`dataScopes`、`permissionUrls` 来自 ARO 本地数据库。

---

## 四、业务 API 鉴权方式

所有业务 API 需要带 token 请求头:

```
GET/POST /jtu/api/...
Headers:
  token: eyJhbGciOiJIUzUxMiJ9...
  Content-Type: application/json
```

验证过的可用 API（200 返回数据）:

| API | 说明 |
|-----|------|
| `GET /jtu/api/ucenter` | 用户中心（完整档案） |
| `GET /jtu/api/menu` | 菜单 |
| `GET /jtu/api/access/record/list` | 人员进出列表 |
| `GET /jtu/api/admin/examUserOffline/2` | 培训列表 |
| `GET /jtu/api/admin/examUserOffline/examinerList` | 主考官列表 |
| `GET /jtu/api/dict/{id}` | 字典数据 |
| `GET /jtu/api/index/getLoginInfo` | 登录信息/公告 |
| `GET /jtu/api/actorsByCurrUser` | 当前用户角色列表 |

---

## 五、登录后 ARO 前端调用的 API 序列

登录成功后，ARO 前端按以下顺序调用 API 初始化页面：

| 顺序 | API | 说明 |
|------|-----|------|
| 1 | `GET /jtu/api/loginAuth?ticket=ST-xxx` | Ticket → JWT Token |
| 2 | `GET /jtu/api/menu` | 菜单结构 |
| 3 | `GET /jtu/api/index/getLoginInfo` | 登录信息/最新公告 |
| 4 | `GET /jtu/api/actorsByCurrUser` | 角色列表 |
| 5 | `GET /jtu/api/ucenter` | 完整用户档案 |
| 6 | `GET /jtu/api/admin/area/simplelist` | 区域列表 |
| 7 | `GET /jtu/api/admin/room/user/rooms/v2` | 用户房间列表 |
| 8 | `GET /jtu/api/aup` | AUP 数据 |
| 9 | `GET /jtu/api/index/news` | 新闻公告 |
| 10 | `GET /jtu/api/index/getIndexNumbersInfoVo` | 首页统计数字 |

---

## 六、"代登录"实现方案

需求：用户在我们的系统内绑定 ARO 身份，由后端代用户获取 Token 并调用 ARO API。

### 6.1 方案 A：存储密码直登（简单可靠）

适用条件：用户已绑定 ARO 本地账号（手机号 + 密码）

```
后端调用: POST /jtu/api/login {account, password}
         → 直接返回 JWT Token（无验证码，无额外验证）
```

优点：纯后端 HTTP 调用，无需浏览器交互
缺点：用户需要在 ARO 设置本地密码（可用"忘记密码"功能）

### 6.2 方案 B：CAS 代登录（无需本地密码）

适用条件：用户只有 CAS 统一认证账号，无 ARO 本地密码

#### 两步流程

**第一步（用户手动，仅一次）**:

浏览器打开不带 `service` 参数的 CAS 登录页:

```
https://auth2.shsmu.edu.cn/cas/login
```

用户输入 CAS 账号、密码、验证码 → 登录成功 → CAS 设置 CASTGC Cookie（长期有效）。

此页面登录成功后仅显示"登录成功"，不跳转到任何第三方。

**第二步（后端自动，可重复执行）**:

```
① 后端带 CASTGC Cookie 请求 CAS（不跟随重定向）
   GET https://auth2.shsmu.edu.cn/cas/login?service=https%3A%2F%2Faro.shsmu.edu.cn%2F%23%2Fjtu%2Fapi%2FloginAuth
   Cookie: CASTGC=TGT-xxx

② CAS 发现有效 CASTGC → 返回 302
   Location: https://aro.shsmu.edu.cn/?ticket=ST-310122-xxx#/jtu/api/loginAuth

   拦截此 302 响应，从 Location 头提取 ticket。
   不要跟随重定向到 ARO（ARO 前端会消费 ticket）。

③ 用 ticket 换 Token
   GET https://aro.shsmu.edu.cn/jtu/api/loginAuth?ticket=ST-310122-xxx

   返回: { "data": { "token": "eyJ..." }, "status": 0 }
```

**本质**：将原来的浏览器自动跟随重定向改为后端手动控制，使得 ticket 不会被 ARO 前端消费。

**技术要点**:

- Ticket 是一次性的，被消费后立即失效。必须确保只有你的后端消费
- CASTGC Cookie 过期后需要用户重新执行第一步
- CAS 的 service 参数中 `#` 必须 URL-encode 为 `%23`，否则 CAS 无法正确回调
- 如果 CASTGC 已存在（第一步已完成），第二步直接用 curl/HTTP 客户端即可，无需浏览器
- 可选的中间步骤：后端自行调 CAS `serviceValidate` 获取用户属性（见第三章），再决定是否继续

---

## 七、CAS 验证码

位置: CAS 登录页，`https://auth2.shsmu.edu.cn/cas/captcha.jpg`

特征：
- 尺寸 120×38 像素（实际显示 89×30）
- 服务端生成，每次刷新不同
- 后端严格校验，输入错误返回"验证码输入有误"

注意：CAS 验证码是代登录方案 B 中唯一需要用户手动参与的环节。ARO 的 `/jtu/api/login` 接口（方案 A）无验证码。

---

## 八、CAS 登出与 CASTGC Cookie

### 8.1 问题

ARO 前端的"退出登录"仅清除 `localStorage.token`，不会销毁 CAS 的 CASTGC Cookie。导致用户再次点击"统一认证登录"时，CAS 看到有效 CASTGC 直接自动登录，无法切换账号。

### 8.2 解决

退出登录时访问 CAS 登出接口:

```
https://auth2.shsmu.edu.cn/cas/logout
```

这会销毁 CAS 服务端的 CASTGC Cookie。之后再访问 CAS 登录页需要重新输入密码和验证码。

---

## 九、方案 B 实现伪代码

```python
# 第一步：引导用户到无 service 的 CAS 登录页
# 用户手动输入验证码 → 登录成功 → CASTGC Cookie 已设置

# 第二步：后端定时或按需获取 Token（CASTGC 有效期内可重复执行）

import requests

SERVICE = "https://aro.shsmu.edu.cn/#/jtu/api/loginAuth"
CAS_URL = f"https://auth2.shsmu.edu.cn/cas/login?service={SERVICE.replace('#', '%23')}"

# 携带 CASTGC Cookie 请求 CAS，禁止跟随重定向
resp = requests.get(CAS_URL, cookies=tgc_cookies, allow_redirects=False)

# 从 Location 头提取 ticket
ticket = extract_ticket_from_url(resp.headers["Location"])

# 可选：直接调 CAS serviceValidate 获取用户身份
# cas_resp = requests.get(
#     f"https://auth2.shsmu.edu.cn/cas/serviceValidate"
#     f"?service={SERVICE.replace('#', '%23')}&ticket={ticket}"
# )
# # 解析 XML 获取 username, account, email 等
# user_info = parse_cas_xml(cas_resp.text)

# 用 ticket 换 JWT
token_resp = requests.get(f"https://aro.shsmu.edu.cn/jtu/api/loginAuth?ticket={ticket}")
jwt_token = token_resp.json()["data"]["token"]

# 调用 ARO 业务 API
api_resp = requests.get(
    "https://aro.shsmu.edu.cn/jtu/api/ucenter",
    headers={"token": jwt_token}
)
```

---

## 十、参考

- ARO 后端接口文档: `http://47.97.207.88/jtu/doc.html`
- CAS 认证中心: `https://auth2.shsmu.edu.cn/cas/`
- CAS 2.0 协议: `https://auth2.shsmu.edu.cn/cas/serviceValidate`
- CAS 1.0 协议: `https://auth2.shsmu.edu.cn/cas/validate`（仅返回 yes/no）
- 本文档基于 2026-07-23 实测验证
