# 学生端门户实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建完全隔离的学生端 Web 门户 —— 包含独立设计系统、QR 码注册、聚合个人档案、学生后台布局与占位页面。

**Architecture:** 前端在 `features/student/` 下自包含所有组件/页面/路由，CSS 令牌以 `--student-*` 命名空间与教职工 `--twin-*` / `--admin-*` 零交叉。后端新增 `POST /api/auth/register/student/verify-qr`（ZXing 解码 + ARO 人员库匹配）、`POST /api/auth/register/student`（免邀请码注册）、`GET /api/student/profile`（聚合档案）等端点。路由层面 `/student/*` 与 `/admin/*` 通过角色守卫互斥。

**Tech Stack:** React 19 + TypeScript 5.9 + Vite 8 + Tailwind CSS 3 + TanStack Query v5 + Zustand v5 + react-router-dom v7 + shadcn/ui base (Radix primitives) + html5-qrcode（前端 QR 解码） + Spring Boot 3.5 + MyBatis + ZXing Java（后端 QR 解码）

**Source of Truth:** `docs/superpowers/specs/2026-05-29-student-portal-design.md`

---

## 文件结构总览

```
新建文件:
  frontend/src/features/student/
  ├── config/
  │   └── student-design-tokens.css       ← 所有 --student-* CSS 变量
  ├── components/
  │   ├── ui/
  │   │   ├── button.tsx
  │   │   ├── input.tsx
  │   │   ├── select.tsx
  │   │   ├── switch.tsx
  │   │   ├── checkbox.tsx
  │   │   ├── badge.tsx
  │   │   ├── card.tsx
  │   │   ├── dialog.tsx
  │   │   ├── toast.tsx
  │   │   ├── avatar.tsx
  │   │   ├── skeleton.tsx
  │   │   ├── empty-state.tsx
  │   │   ├── error-retry.tsx
  │   │   ├── table.tsx
  │   │   ├── tabs.tsx
  │   │   ├── tooltip.tsx
  │   │   └── theme-picker.tsx
  │   ├── layout/
  │   │   ├── student-layout.tsx
  │   │   ├── student-sidebar.tsx
  │   │   └── student-header.tsx
  │   └── qr/
  │       ├── qr-uploader.tsx
  │       └── qr-camera.tsx
  ├── hooks/
  │   ├── use-student-theme.ts
  │   ├── use-student-profile.ts
  │   └── use-student-access-records.ts
  ├── pages/
  │   ├── student-login.tsx
  │   ├── student-register.tsx
  │   ├── student-home.tsx
  │   ├── student-records.tsx
  │   ├── student-permissions.tsx
  │   ├── student-profile.tsx
  │   └── student-settings.tsx
  ├── api/
  │   └── student.api.ts
  └── router/
      └── student-routes.tsx

修改文件:
  frontend/src/router/index.tsx          ← 新增 /student/* 路由
  frontend/src/index.css                 ← 新增 --student-* 令牌
  frontend/tailwind.config.js            ← 新增 student-* 颜色/圆角/阴影
  frontend/src/router/AuthGuard.tsx      ← 支持 requireRole 参数

后端新建:
  src/main/java/com/example/demo/modules/student/
  ├── controller/StudentAuthController.java
  ├── controller/StudentProfileController.java
  ├── service/StudentRegistrationService.java
  ├── service/StudentProfileService.java
  ├── dto/StudentRegisterRequest.java
  ├── dto/StudentQrVerifyResponse.java
  └── dto/StudentProfileResponse.java

后端修改:
  pom.xml                                ← ZXing 依赖
  src/main/java/.../modules/auth/controller/AuthController.java ← loginWeb 角色分流增强
```

---

### Task 1: 后端 ZXing QR 解码依赖

**Files:**
- Modify: `pom.xml`

- [ ] **Step 1: 添加 ZXing 依赖到 pom.xml**

在 `<dependencies>` 中添加：

```xml
<!-- ZXing 二维码解码 -->
<dependency>
    <groupId>com.google.zxing</groupId>
    <artifactId>core</artifactId>
    <version>3.5.3</version>
</dependency>
<dependency>
    <groupId>com.google.zxing</groupId>
    <artifactId>javase</artifactId>
    <version>3.5.3</version>
</dependency>
```

- [ ] **Step 2: 验证依赖下载**

Run: `mvn dependency:resolve -q`
Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
git add pom.xml
git commit -m "chore: add ZXing dependency for student QR code registration"
```

---

### Task 2: 后端学生注册 DTO

**Files:**
- Create: `src/main/java/com/example/demo/modules/student/dto/StudentRegisterRequest.java`
- Create: `src/main/java/com/example/demo/modules/student/dto/StudentQrVerifyResponse.java`

- [ ] **Step 1: 创建 StudentRegisterRequest**

```java
package com.example.demo.modules.student.dto;

public class StudentRegisterRequest {
    private String userId;      // 19位 ARO user_id（从QR码解码得到）
    private String username;    // 用户自设账号
    private String password;    // 用户自设密码

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
}
```

- [ ] **Step 2: 创建 StudentQrVerifyResponse**

```java
package com.example.demo.modules.student.dto;

public class StudentQrVerifyResponse {
    private boolean verified;
    private String userId;
    private String name;
    private String departmentName;
    private String projectGroupName;
    private String message;

    public static StudentQrVerifyResponse success(String userId, String name,
            String departmentName, String projectGroupName) {
        StudentQrVerifyResponse r = new StudentQrVerifyResponse();
        r.verified = true;
        r.userId = userId;
        r.name = name;
        r.departmentName = departmentName;
        r.projectGroupName = projectGroupName;
        return r;
    }

    public static StudentQrVerifyResponse fail(String message) {
        StudentQrVerifyResponse r = new StudentQrVerifyResponse();
        r.verified = false;
        r.message = message;
        return r;
    }

    // getters & setters
    public boolean isVerified() { return verified; }
    public void setVerified(boolean verified) { this.verified = verified; }
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDepartmentName() { return departmentName; }
    public void setDepartmentName(String departmentName) { this.departmentName = departmentName; }
    public String getProjectGroupName() { return projectGroupName; }
    public void setProjectGroupName(String projectGroupName) { this.projectGroupName = projectGroupName; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/main/java/com/example/demo/modules/student/
git commit -m "feat: add student registration DTOs"
```

---

### Task 3: 后端学生注册 Service

**Files:**
- Create: `src/main/java/com/example/demo/modules/student/service/StudentRegistrationService.java`

- [ ] **Step 1: 创建 StudentRegistrationService**

```java
package com.example.demo.modules.student.service;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.aro.entity.AroPersonnel;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.auth.AuthProfileConstants;
import com.example.demo.modules.auth.dto.RegisterStaffRequest;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.auth.service.AuthService;
import com.example.demo.modules.auth.service.PasswordCredentialService;
import com.example.demo.modules.student.dto.StudentRegisterRequest;
import com.example.demo.modules.student.dto.StudentQrVerifyResponse;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.NotFoundException;
import com.google.zxing.Result;
import com.google.zxing.client.j2se.BufferedImageLuminanceSource;
import com.google.zxing.common.HybridBinarizer;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.util.UUID;

@Service
public class StudentRegistrationService {

    private final UserMapper userMapper;
    private final AuthService authService;
    private final PasswordCredentialService passwordCredentialService;
    private final AroPersonnelMapper aroPersonnelMapper;

    public StudentRegistrationService(UserMapper userMapper,
                                       AuthService authService,
                                       PasswordCredentialService passwordCredentialService,
                                       AroPersonnelMapper aroPersonnelMapper) {
        this.userMapper = userMapper;
        this.authService = authService;
        this.passwordCredentialService = passwordCredentialService;
        this.aroPersonnelMapper = aroPersonnelMapper;
    }

    /**
     * 解码上传的 QR 码图片，提取 19 位 user_id，匹配 aro_personnel 表
     */
    public StudentQrVerifyResponse verifyQrAndMatchPersonnel(MultipartFile file) {
        // 1. 解码 QR 码
        String decodedText;
        try {
            BufferedImage image = ImageIO.read(file.getInputStream());
            if (image == null) {
                return StudentQrVerifyResponse.fail("无法解析图片，请上传清晰的二维码图片");
            }
            BinaryBitmap bitmap = new BinaryBitmap(
                new HybridBinarizer(new BufferedImageLuminanceSource(image)));
            Result result = new MultiFormatReader().decode(bitmap);
            decodedText = result.getText();
        } catch (NotFoundException e) {
            return StudentQrVerifyResponse.fail("未识别到二维码，请确保图片中包含清晰的二维码");
        } catch (IOException e) {
            return StudentQrVerifyResponse.fail("图片读取失败，请重试");
        } catch (Exception e) {
            return StudentQrVerifyResponse.fail("二维码解析失败: " + e.getMessage());
        }

        if (!StringUtils.hasText(decodedText)) {
            return StudentQrVerifyResponse.fail("二维码内容为空");
        }

        // 2. 提取 19 位数字（支持纯数字ID 或 含URL的二维码中提取）
        String userId = extract19DigitId(decodedText);
        if (userId == null) {
            return StudentQrVerifyResponse.fail("未识别到有效的19位人员ID，解码内容: " +
                (decodedText.length() > 30 ? decodedText.substring(0, 30) + "..." : decodedText));
        }

        // 3. 查询 aro_personnel
        AroPersonnel personnel = aroPersonnelMapper.findByUserId(userId);
        if (personnel == null) {
            return StudentQrVerifyResponse.fail("该ID未在授权人员库中，请联系管理员确认权限");
        }

        return StudentQrVerifyResponse.success(
            userId, personnel.getName(),
            personnel.getDepartmentName(),
            personnel.getProjectGroupName()
        );
    }

    /**
     * 从解码文本中提取 19 位数字 ID
     */
    private String extract19DigitId(String text) {
        if (text == null) return null;
        // 先尝试直接匹配 19 位数字
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("\\d{19}").matcher(text);
        if (m.find()) {
            return m.group();
        }
        // 如果文本本身是纯数字且长度在合理范围
        String digits = text.replaceAll("\\D", "");
        if (digits.length() == 19) {
            return digits;
        }
        return null;
    }

    /**
     * 学生注册（免邀请码，以 user_id 绑定为验证）
     */
    @Transactional(rollbackFor = Exception.class)
    public Result<?> register(StudentRegisterRequest request) {
        if (request == null || !StringUtils.hasText(request.getUserId())
                || !StringUtils.hasText(request.getUsername())
                || !StringUtils.hasText(request.getPassword())) {
            return Result.error("注册信息不完整");
        }

        String username = request.getUsername().trim();
        if (username.length() < 3 || username.length() > 64 || request.getPassword().length() < 6) {
            return Result.error("账号需3-64位，密码至少6位");
        }

        if (userMapper.findByUsername(username) != null) {
            return Result.error("账号已存在");
        }

        // 二次验证 user_id 存在（防止注册过程中数据变更）
        AroPersonnel personnel = aroPersonnelMapper.findByUserId(request.getUserId());
        if (personnel == null) {
            return Result.error("该ID未在授权人员库中");
        }

        User user = new User();
        user.setId("STU_" + UUID.randomUUID().toString().replace("-", ""));
        user.setUsername(username);
        user.setPassword(passwordCredentialService.encodeForStorage(request.getPassword()));
        user.setRole(RoleEnum.STUDENT);
        user.setStatus(1);
        user.setPasswordResetRequired(0);
        user.setAuthProfile(AuthProfileConstants.WEB_PASSWORD);
        userMapper.insertUser(user);

        user = userMapper.findById(user.getId());
        user.setRole(authService.normalizeRole(user.getRole()));
        return authService.generateAuthResult(user);
    }

    /**
     * 检查 ARO 人员是否存在
     */
    public boolean isPersonnelExists(String userId) {
        return aroPersonnelMapper.findByUserId(userId) != null;
    }
}
```

- [ ] **Step 2: 验证编译**

Run: `mvn compile -q`
Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
git add src/main/java/com/example/demo/modules/student/
git commit -m "feat: add StudentRegistrationService with QR decode + personnel matching"
```

---

### Task 4: 后端学生认证 Controller

**Files:**
- Create: `src/main/java/com/example/demo/modules/student/controller/StudentAuthController.java`

- [ ] **Step 1: 创建 StudentAuthController**

```java
package com.example.demo.modules.student.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.student.dto.StudentRegisterRequest;
import com.example.demo.modules.student.dto.StudentQrVerifyResponse;
import com.example.demo.modules.student.service.StudentRegistrationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/auth/register/student")
@Tag(name = "学生认证", description = "学生端注册与 QR 验证")
public class StudentAuthController {

    private final StudentRegistrationService studentRegistrationService;

    public StudentAuthController(StudentRegistrationService studentRegistrationService) {
        this.studentRegistrationService = studentRegistrationService;
    }

    @PostMapping("/verify-qr")
    @Operation(summary = "上传QR码图片，解码并匹配人员库")
    public Result<StudentQrVerifyResponse> verifyQr(@RequestParam("file") MultipartFile file) {
        if (file == null || file.isEmpty()) {
            return Result.error("请上传二维码图片");
        }
        StudentQrVerifyResponse result = studentRegistrationService.verifyQrAndMatchPersonnel(file);
        return Result.success(result);
    }

    @PostMapping
    @Operation(summary = "学生注册（免邀请码）")
    public Result<?> register(@RequestBody StudentRegisterRequest request) {
        return studentRegistrationService.register(request);
    }
}
```

- [ ] **Step 2: 验证编译**

Run: `mvn compile -q`
Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
git add src/main/java/com/example/demo/modules/student/controller/
git commit -m "feat: add StudentAuthController with QR verify + register endpoints"
```

---

### Task 5: 后端学生档案 Controller + Service

**Files:**
- Create: `src/main/java/com/example/demo/modules/student/controller/StudentProfileController.java`
- Create: `src/main/java/com/example/demo/modules/student/service/StudentProfileService.java`
- Create: `src/main/java/com/example/demo/modules/student/dto/StudentProfileResponse.java`

- [ ] **Step 1: 创建 StudentProfileResponse**

```java
package com.example.demo.modules.student.dto;

public class StudentProfileResponse {
    private AccountInfo account;
    private PersonnelInfo personnel;
    private StatsInfo stats;

    public static class AccountInfo {
        private String username;
        private String role;
        private String createTime;
        // getters & setters
        public String getUsername() { return username; }
        public void setUsername(String username) { this.username = username; }
        public String getRole() { return role; }
        public void setRole(String role) { this.role = role; }
        public String getCreateTime() { return createTime; }
        public void setCreateTime(String createTime) { this.createTime = createTime; }
    }

    public static class PersonnelInfo {
        private String userId;
        private String name;
        private Integer gender;
        private String mobilePhone;
        private String email;
        private String head;
        private String departmentName;
        private String projectGroupName;
        private String userTypeNames;
        private String allowedRoomsDisplayZh;
        private Boolean hasOfficialRoomPermission;
        private Integer totalExp;
        // getters & setters (compact)
        public String getUserId() { return userId; }
        public void setUserId(String userId) { this.userId = userId; }
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public Integer getGender() { return gender; }
        public void setGender(Integer gender) { this.gender = gender; }
        public String getMobilePhone() { return mobilePhone; }
        public void setMobilePhone(String mobilePhone) { this.mobilePhone = mobilePhone; }
        public String getEmail() { return email; }
        public void setEmail(String email) { this.email = email; }
        public String getHead() { return head; }
        public void setHead(String head) { this.head = head; }
        public String getDepartmentName() { return departmentName; }
        public void setDepartmentName(String departmentName) { this.departmentName = departmentName; }
        public String getProjectGroupName() { return projectGroupName; }
        public void setProjectGroupName(String projectGroupName) { this.projectGroupName = projectGroupName; }
        public String getUserTypeNames() { return userTypeNames; }
        public void setUserTypeNames(String userTypeNames) { this.userTypeNames = userTypeNames; }
        public String getAllowedRoomsDisplayZh() { return allowedRoomsDisplayZh; }
        public void setAllowedRoomsDisplayZh(String allowedRoomsDisplayZh) { this.allowedRoomsDisplayZh = allowedRoomsDisplayZh; }
        public Boolean getHasOfficialRoomPermission() { return hasOfficialRoomPermission; }
        public void setHasOfficialRoomPermission(Boolean hasOfficialRoomPermission) { this.hasOfficialRoomPermission = hasOfficialRoomPermission; }
        public Integer getTotalExp() { return totalExp; }
        public void setTotalExp(Integer totalExp) { this.totalExp = totalExp; }
    }

    public static class StatsInfo {
        private int recentAccessCount;
        // getters & setters
        public int getRecentAccessCount() { return recentAccessCount; }
        public void setRecentAccessCount(int recentAccessCount) { this.recentAccessCount = recentAccessCount; }
    }

    public AccountInfo getAccount() { return account; }
    public void setAccount(AccountInfo account) { this.account = account; }
    public PersonnelInfo getPersonnel() { return personnel; }
    public void setPersonnel(PersonnelInfo personnel) { this.personnel = personnel; }
    public StatsInfo getStats() { return stats; }
    public void setStats(StatsInfo stats) { this.stats = stats; }
}
```

- [ ] **Step 2: 创建 StudentProfileService**

```java
package com.example.demo.modules.student.service;

import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.aro.entity.AroPersonnel;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.student.dto.StudentProfileResponse;
import org.springframework.stereotype.Service;

@Service
public class StudentProfileService {

    private final AuthContextService authContextService;
    private final AroPersonnelMapper aroPersonnelMapper;

    public StudentProfileService(AuthContextService authContextService,
                                  AroPersonnelMapper aroPersonnelMapper) {
        this.authContextService = authContextService;
        this.aroPersonnelMapper = aroPersonnelMapper;
    }

    public StudentProfileResponse buildProfile(User user) {
        StudentProfileResponse resp = new StudentProfileResponse();

        StudentProfileResponse.AccountInfo account = new StudentProfileResponse.AccountInfo();
        account.setUsername(user.getUsername());
        account.setRole(user.getRole().name());
        account.setCreateTime(user.getCreateTime());
        resp.setAccount(account);

        AroPersonnel p = aroPersonnelMapper.findByUserId(user.getId());
        // fallback: 尝试通过 name 匹配
        if (p == null) {
            p = aroPersonnelMapper.findByName(user.getUsername());
        }

        if (p != null) {
            StudentProfileResponse.PersonnelInfo pi = new StudentProfileResponse.PersonnelInfo();
            pi.setUserId(p.getUserId());
            pi.setName(p.getName());
            pi.setGender(p.getGender());
            pi.setMobilePhone(p.getMobilePhone());
            pi.setEmail(p.getEmail());
            pi.setHead(p.getHead());
            pi.setDepartmentName(p.getDepartmentName());
            pi.setProjectGroupName(p.getProjectGroupName());
            pi.setUserTypeNames(p.getUserTypeNames());
            pi.setAllowedRoomsDisplayZh(p.getAllowedRoomsDisplayZh());
            pi.setHasOfficialRoomPermission(p.getHasOfficialRoomPermission());
            pi.setTotalExp(p.getTotalExp());
            resp.setPersonnel(pi);
        }

        StudentProfileResponse.StatsInfo stats = new StudentProfileResponse.StatsInfo();
        stats.setRecentAccessCount(0); // placeholder
        resp.setStats(stats);

        return resp;
    }
}
```

- [ ] **Step 3: 创建 StudentProfileController**

```java
package com.example.demo.modules.student.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.student.dto.StudentProfileResponse;
import com.example.demo.modules.student.service.StudentProfileService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/student")
@Tag(name = "学生档案", description = "学生个人档案与数据接口")
public class StudentProfileController {

    private final AuthContextService authContextService;
    private final StudentProfileService studentProfileService;

    public StudentProfileController(AuthContextService authContextService,
                                     StudentProfileService studentProfileService) {
        this.authContextService = authContextService;
        this.studentProfileService = studentProfileService;
    }

    @GetMapping("/profile")
    @Operation(summary = "获取学生个人聚合档案")
    public Result<StudentProfileResponse> getProfile(HttpServletRequest request) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) {
            return Result.error("未登录");
        }
        return Result.success(studentProfileService.buildProfile(user));
    }

    @GetMapping("/access-records")
    @Operation(summary = "学生出入记录（占位）")
    public Result<?> getAccessRecords(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        return Result.success(java.util.Map.of("data", java.util.List.of(), "total", 0));
    }

    @GetMapping("/permissions")
    @Operation(summary = "学生门禁权限（占位）")
    public Result<?> getPermissions() {
        return Result.success(java.util.Map.of("rooms", java.util.List.of()));
    }
}
```

- [ ] **Step 4: 检查 AroPersonnelMapper 是否有 findByUserId 方法**

检查 `src/main/java/com/example/demo/modules/aro/mapper/AroPersonnelMapper.java`。如果缺少 `findByUserId` 和 `findByName` 方法，添加：

```java
@Select("SELECT * FROM aro_personnel WHERE user_id = #{userId}")
AroPersonnel findByUserId(@Param("userId") String userId);

@Select("SELECT * FROM aro_personnel WHERE name = #{name} LIMIT 1")
AroPersonnel findByName(@Param("name") String name);
```

- [ ] **Step 5: 验证编译**

Run: `mvn compile -q`
Expected: BUILD SUCCESS

- [ ] **Step 6: Commit**

```bash
git add src/main/java/com/example/demo/modules/student/ src/main/java/com/example/demo/modules/aro/mapper/
git commit -m "feat: add student profile controller + service with aggregated data"
```

---

### Task 6: 前端 html5-qrcode 依赖

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: 安装 html5-qrcode**

Run: `cd frontend && npm install html5-qrcode`
Expected: package added to package.json

- [ ] **Step 2: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: add html5-qrcode for student QR registration"
```

---

### Task 7: 前端设计令牌 CSS

**Files:**
- Create: `frontend/src/features/student/config/student-design-tokens.css`
- Modify: `frontend/src/index.css` (追加 @import)
- Modify: `frontend/tailwind.config.js` (追加 student 颜色/圆角/阴影)

- [ ] **Step 1: 创建 CSS 令牌文件**

```css
/* frontend/src/features/student/config/student-design-tokens.css */
/* 学生端设计令牌 —— 来源: docs/superpowers/specs/2026-05-29-student-portal-design.md */

:root {
  /* === 主色调（默认浅紫） === */
  --student-primary:          #8b5cf6;
  --student-primary-hover:    #7c3aed;
  --student-primary-pressed:  #6d28d9;
  --student-primary-soft:     #ede9fe;
  --student-primary-muted:    #ddd6fe;
  --student-on-primary:       #ffffff;

  /* === 灰度阶梯 === */
  --student-ink:              #1a1a1a;
  --student-body:             #525252;
  --student-mute:             #8c8c8c;
  --student-canvas:           #ffffff;
  --student-canvas-soft:      #fafafa;
  --student-canvas-soft-2:    #f5f5f5;
  --student-hairline:         #e5e5e5;
  --student-hairline-strong:  #a3a3a3;

  /* === 功能色卡 === */
  --student-accent-access:        #16a34a;
  --student-accent-access-soft:   #dcfce7;
  --student-accent-telemetry:     #0284c7;
  --student-accent-telemetry-soft:#e0f2fe;
  --student-accent-alert:         #d97706;
  --student-accent-alert-soft:    #fef3c7;
  --student-accent-profile:       #7c3aed;
  --student-accent-profile-soft:  #ede9fe;

  /* === 语义色 === */
  --student-success:          #16a34a;
  --student-success-soft:     #dcfce7;
  --student-error:            #dc2626;
  --student-error-soft:       #fee2e2;
  --student-warning:          #f59e0b;
  --student-warning-soft:     #fef3c7;

  /* === 圆角 === */
  --student-radius-xs:   6px;
  --student-radius-sm:   8px;
  --student-radius-md:   12px;
  --student-radius-lg:   16px;
  --student-radius-xl:   24px;
  --student-radius-pill: 100px;
  --student-radius-full: 9999px;

  /* === 阴影 === */
  --student-shadow-card:
    0 0 0 1px rgba(0,0,0,0.08),
    0 1px 2px rgba(0,0,0,0.04),
    0 2px 4px rgba(0,0,0,0.04);
  --student-shadow-card-hover:
    0 0 0 1px rgba(0,0,0,0.08),
    0 2px 4px rgba(0,0,0,0.06),
    0 8px 16px rgba(0,0,0,0.06);
  --student-shadow-modal:
    0 0 0 1px rgba(0,0,0,0.08),
    0 8px 16px rgba(0,0,0,0.08),
    0 24px 48px rgba(0,0,0,0.10);
}

/* === 主题色变体 === */
[data-student-theme="violet"] {
  --student-primary: #8b5cf6;
  --student-primary-soft: #ede9fe;
}
[data-student-theme="blue"] {
  --student-primary: #3b82f6;
  --student-primary-soft: #dbeafe;
}
[data-student-theme="green"] {
  --student-primary: #22c55e;
  --student-primary-soft: #dcfce7;
}
[data-student-theme="amber"] {
  --student-primary: #f59e0b;
  --student-primary-soft: #fef3c7;
}
[data-student-theme="rose"] {
  --student-primary: #f43f5e;
  --student-primary-soft: #ffe4e6;
}
```

- [ ] **Step 2: 在 index.css 中引入令牌**

在 `frontend/src/index.css` 的 `@import` 区域追加一行：

```css
@import "@/features/student/config/student-design-tokens.css";
```

- [ ] **Step 3: 更新 Tailwind 配置**

在 `frontend/tailwind.config.js` 的 `theme.extend` 中追加：

```js
colors: {
    // ... existing shadcn colors stay ...
    student: {
        primary: "var(--student-primary)",
        'primary-soft': "var(--student-primary-soft)",
        ink: "var(--student-ink)",
        body: "var(--student-body)",
        mute: "var(--student-mute)",
        canvas: "var(--student-canvas)",
        'canvas-soft': "var(--student-canvas-soft)",
        hairline: "var(--student-hairline)",
        success: "var(--student-success)",
        error: "var(--student-error)",
        warning: "var(--student-warning)",
    },
},
borderRadius: {
    // ... existing stays ...
    'student-xs': "var(--student-radius-xs)",
    'student-sm': "var(--student-radius-sm)",
    'student-md': "var(--student-radius-md)",
    'student-lg': "var(--student-radius-lg)",
    'student-pill': "var(--student-radius-pill)",
    'student-full': "var(--student-radius-full)",
},
boxShadow: {
    // ... existing stays ...
    'student-card': "var(--student-shadow-card)",
    'student-card-hover': "var(--student-shadow-card-hover)",
    'student-modal': "var(--student-shadow-modal)",
},
```

- [ ] **Step 4: 验证前端编译**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/student/config/ frontend/src/index.css frontend/tailwind.config.js
git commit -m "feat: add student design tokens CSS + Tailwind config"
```

---

### Task 8: 前端 UI 组件 — button / input / card

**Files:**
- Create: `frontend/src/features/student/components/ui/button.tsx`
- Create: `frontend/src/features/student/components/ui/input.tsx`
- Create: `frontend/src/features/student/components/ui/card.tsx`

- [ ] **Step 1: 创建 Button 组件**

```tsx
// frontend/src/features/student/components/ui/button.tsx
import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--student-primary-soft)] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--student-primary)] text-[var(--student-on-primary)] hover:bg-[var(--student-primary-hover)] active:bg-[var(--student-primary-pressed)]",
        secondary:
          "bg-[var(--student-canvas)] text-[var(--student-ink)] border border-[var(--student-hairline)] hover:bg-[var(--student-canvas-soft)]",
        ghost:
          "bg-transparent text-[var(--student-body)] hover:bg-[var(--student-canvas-soft)]",
        destructive:
          "bg-[var(--student-error)] text-white hover:opacity-90",
      },
      size: {
        sm: "h-8 rounded-[var(--student-radius-sm)] px-3 text-xs",
        md: "h-10 rounded-[var(--student-radius-sm)] px-4 text-sm",
        lg: "h-12 rounded-[var(--student-radius-sm)] px-6 text-base",
        pill: "h-10 rounded-[var(--student-radius-pill)] px-6 text-sm",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "StudentButton";

export { Button, buttonVariants };
```

- [ ] **Step 2: 创建 Input 组件**

```tsx
// frontend/src/features/student/components/ui/input.tsx
import { InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** 错误状态 */
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <div className="w-full">
        <input
          ref={ref}
          className={cn(
            "flex h-10 w-full rounded-[var(--student-radius-sm)] border bg-[var(--student-canvas)] px-3 py-2 text-sm text-[var(--student-ink)] placeholder:text-[var(--student-mute)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--student-primary-soft)] focus-visible:border-[var(--student-primary)]",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error
              ? "border-[var(--student-error)] focus-visible:ring-[var(--student-error-soft)] focus-visible:border-[var(--student-error)]"
              : "border-[var(--student-hairline)]",
            className
          )}
          {...props}
        />
        {error && (
          <p className="mt-1 text-xs text-[var(--student-error)]">{error}</p>
        )}
      </div>
    );
  }
);
Input.displayName = "StudentInput";

export { Input };
```

- [ ] **Step 3: 创建 Card 组件**

```tsx
// frontend/src/features/student/components/ui/card.tsx
import { HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "soft" | "bordered";
  padding?: "md" | "lg";
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "default", padding = "md", children, ...props }, ref) => {
    const base = "rounded-[var(--student-radius-md)]";
    const variants: Record<string, string> = {
      default: "bg-[var(--student-canvas)] shadow-[var(--student-shadow-card)] hover:shadow-[var(--student-shadow-card-hover)] transition-shadow",
      soft: "bg-[var(--student-canvas-soft)]",
      bordered: "bg-[var(--student-canvas)] border border-[var(--student-hairline)]",
    };
    const paddings: Record<string, string> = {
      md: "p-4",
      lg: "p-6",
    };
    return (
      <div
        ref={ref}
        className={cn(base, variants[variant], paddings[padding], className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Card.displayName = "StudentCard";

export { Card };
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/student/components/ui/
git commit -m "feat: add StudentButton, StudentInput, StudentCard components"
```

---

### Task 9: 前端 UI 组件 — badge / avatar / skeleton / empty-state / error-retry

**Files:**
- Create: `frontend/src/features/student/components/ui/badge.tsx`
- Create: `frontend/src/features/student/components/ui/avatar.tsx`
- Create: `frontend/src/features/student/components/ui/skeleton.tsx`
- Create: `frontend/src/features/student/components/ui/empty-state.tsx`
- Create: `frontend/src/features/student/components/ui/error-retry.tsx`

- [ ] **Step 1: 创建 Badge**

```tsx
import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

type BadgeVariant = "default" | "success" | "warning" | "error" | "access" | "telemetry" | "alert" | "profile";

const variantStyles: Record<BadgeVariant, string> = {
  default:   "bg-[var(--student-primary-soft)] text-[var(--student-primary)]",
  success:   "bg-[var(--student-success-soft)] text-[var(--student-success)]",
  warning:   "bg-[var(--student-warning-soft)] text-[var(--student-warning)]",
  error:     "bg-[var(--student-error-soft)] text-[var(--student-error)]",
  access:    "bg-[var(--student-accent-access-soft)] text-[var(--student-accent-access)]",
  telemetry: "bg-[var(--student-accent-telemetry-soft)] text-[var(--student-accent-telemetry)]",
  alert:     "bg-[var(--student-accent-alert-soft)] text-[var(--student-accent-alert)]",
  profile:   "bg-[var(--student-accent-profile-soft)] text-[var(--student-accent-profile)]",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = "default", children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center h-5 px-2 rounded-[var(--student-radius-full)] text-xs font-medium",
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 2: 创建 Avatar**

```tsx
import { cn } from "@/lib/utils";

interface AvatarProps {
  src?: string;
  alt?: string;
  fallback?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-14 w-14 text-base" };

export function Avatar({ src, alt, fallback, size = "md", className }: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt ?? ""}
        className={cn("rounded-[var(--student-radius-full)] object-cover", sizes[size], className)}
      />
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-[var(--student-radius-full)] bg-[var(--student-primary-soft)] text-[var(--student-primary)] font-semibold",
        sizes[size],
        className
      )}
    >
      {(fallback ?? "?").charAt(0).toUpperCase()}
    </span>
  );
}
```

- [ ] **Step 3: 创建 Skeleton**

```tsx
import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
  variant?: "text" | "circular" | "rectangular";
}

export function Skeleton({ className, variant = "text" }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-[pulse_1.5s_ease-in-out_infinite] bg-[var(--student-canvas-soft-2)]",
        variant === "circular" && "rounded-[var(--student-radius-full)]",
        variant === "rectangular" && "rounded-[var(--student-radius-sm)]",
        variant === "text" && "h-4 w-full rounded-[var(--student-radius-xs)]",
        className
      )}
    />
  );
}
```

- [ ] **Step 4: 创建 EmptyState**

```tsx
import { LucideIcon } from "lucide-react";
import { Button } from "./button";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {Icon && <Icon className="h-12 w-12 text-[var(--student-mute)] mb-4" />}
      <h3 className="text-lg font-semibold text-[var(--student-ink)] mb-1">{title}</h3>
      {description && <p className="text-sm text-[var(--student-body)] mb-4 max-w-sm">{description}</p>}
      {actionLabel && onAction && (
        <Button variant="primary" size="sm" onClick={onAction}>{actionLabel}</Button>
      )}
    </div>
  );
}
```

- [ ] **Step 5: 创建 ErrorRetry**

```tsx
import { AlertCircle } from "lucide-react";
import { Button } from "./button";

interface ErrorRetryProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorRetry({ message = "加载失败，请重试", onRetry }: ErrorRetryProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <AlertCircle className="h-6 w-6 text-[var(--student-error)] mb-3" />
      <p className="text-sm text-[var(--student-body)] mb-4">{message}</p>
      {onRetry && (
        <Button variant="ghost" size="sm" onClick={onRetry}>重新加载</Button>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/student/components/ui/
git commit -m "feat: add Badge, Avatar, Skeleton, EmptyState, ErrorRetry components"
```

---

### Task 10: 前端 UI 组件 — switch / checkbox / select / tabs / tooltip

**Files:**
- Create: `frontend/src/features/student/components/ui/switch.tsx`
- Create: `frontend/src/features/student/components/ui/checkbox.tsx`
- Create: `frontend/src/features/student/components/ui/select.tsx`
- Create: `frontend/src/features/student/components/ui/tabs.tsx`
- Create: `frontend/src/features/student/components/ui/tooltip.tsx`

- [ ] **Step 1: 创建 Switch（基于 Radix react-switch）**

```tsx
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function Switch({ checked, onCheckedChange, disabled }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-[var(--student-radius-pill)] border-2 border-transparent transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--student-primary-soft)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-[var(--student-primary)]" : "bg-[var(--student-hairline)]"
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "block h-4 w-4 rounded-[var(--student-radius-full)] bg-white shadow transition-transform",
          checked ? "translate-x-4" : "translate-x-0"
        )}
      />
    </SwitchPrimitive.Root>
  );
}
```

- [ ] **Step 2: 创建 Checkbox（基于 Radix react-checkbox）**

```tsx
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CheckboxProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Checkbox({ checked, onCheckedChange, label, disabled }: CheckboxProps) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer">
      <CheckboxPrimitive.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded-[var(--student-radius-xs)] border border-[var(--student-hairline)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--student-primary-soft)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          checked && "bg-[var(--student-primary)] border-[var(--student-primary)]"
        )}
      >
        <CheckboxPrimitive.Indicator>
          <Check className="h-3.5 w-3.5 text-white" />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      {label && <span className="text-sm text-[var(--student-ink)]">{label}</span>}
    </label>
  );
}
```

- [ ] **Step 3: 创建 Select（原生 select 封装）**

```tsx
import { SelectHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string; label: string }[];
  placeholder?: string;
  error?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, options, placeholder, error, ...props }, ref) => {
    return (
      <div className="w-full">
        <select
          ref={ref}
          className={cn(
            "flex h-10 w-full rounded-[var(--student-radius-sm)] border bg-[var(--student-canvas)] px-3 py-2 text-sm text-[var(--student-ink)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--student-primary-soft)]",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error ? "border-[var(--student-error)]" : "border-[var(--student-hairline)]",
            className
          )}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {error && <p className="mt-1 text-xs text-[var(--student-error)]">{error}</p>}
      </div>
    );
  }
);
Select.displayName = "StudentSelect";
export { Select };
```

- [ ] **Step 4: 创建 Tabs**

```tsx
import { cn } from "@/lib/utils";

interface Tab {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  variant?: "underline" | "pills";
}

export function Tabs({ tabs, activeTab, onTabChange, variant = "underline" }: TabsProps) {
  return (
    <div className={cn("flex", variant === "underline" ? "gap-6 border-b border-[var(--student-hairline)]" : "gap-1")}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            "text-sm font-medium transition-colors",
            variant === "underline" && cn(
              "pb-2 -mb-[1px] border-b-2",
              activeTab === tab.id
                ? "border-[var(--student-primary)] text-[var(--student-primary)]"
                : "border-transparent text-[var(--student-body)] hover:text-[var(--student-ink)]"
            ),
            variant === "pills" && cn(
              "px-3 py-1.5 rounded-[var(--student-radius-pill)]",
              activeTab === tab.id
                ? "bg-[var(--student-primary)] text-white"
                : "bg-[var(--student-canvas-soft)] text-[var(--student-body)] hover:text-[var(--student-ink)]"
            )
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: 创建 Tooltip（基于 Radix react-tooltip）**

```tsx
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}

export function Tooltip({ content, children, side = "top" }: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            className={cn(
              "z-[1600] px-3 py-1.5 text-xs text-[var(--student-on-primary)] bg-[var(--student-ink)] rounded-[var(--student-radius-sm)] shadow-[var(--student-shadow-modal)]",
              "animate-in fade-in-0 zoom-in-95"
            )}
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-[var(--student-ink)]" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
```

- [ ] **Step 6: 验证编译**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/student/components/ui/
git commit -m "feat: add Switch, Checkbox, Select, Tabs, Tooltip components"
```

---

### Task 11: 前端 UI 组件 — dialog / table / toast / theme-picker

**Files:**
- Create: `frontend/src/features/student/components/ui/dialog.tsx`
- Create: `frontend/src/features/student/components/ui/table.tsx`
- Create: `frontend/src/features/student/components/ui/toast.tsx`
- Create: `frontend/src/features/student/components/ui/theme-picker.tsx`

- [ ] **Step 1: 创建 Dialog（基于 Radix react-dialog）**

```tsx
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Dialog({ open, onOpenChange, children }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[1500] bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-[1501] w-full max-w-lg -translate-x-1/2 -translate-y-1/2",
            "rounded-[var(--student-radius-lg)] bg-[var(--student-canvas)] p-6 shadow-[var(--student-shadow-modal)]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out"
          )}
        >
          {children}
          <DialogPrimitive.Close className="absolute right-4 top-4 text-[var(--student-mute)] hover:text-[var(--student-ink)]">
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-lg font-semibold text-[var(--student-ink)]", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-[var(--student-body)]", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-6 flex justify-end gap-3", className)} {...props} />;
}
```

- [ ] **Step 2: 创建 Table**

```tsx
import { cn } from "@/lib/utils";

interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
}

export function Table<T>({ columns, data, rowKey, onRowClick }: TableProps<T>) {
  return (
    <div className="w-full overflow-auto rounded-[var(--student-radius-md)] border border-[var(--student-hairline)]">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[var(--student-hairline)] bg-[var(--student-canvas-soft)]">
            {columns.map((col) => (
              <th key={col.key} className={cn("px-4 py-2.5 text-left text-xs font-medium text-[var(--student-body)] uppercase", col.className)}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={() => onRowClick?.(row)}
              className={cn("border-b border-[var(--student-hairline)] last:border-0", onRowClick && "cursor-pointer hover:bg-[var(--student-canvas-soft)]")}
            >
              {columns.map((col) => (
                <td key={col.key} className={cn("px-4 py-2.5 text-sm text-[var(--student-ink)]", col.className)}>
                  {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: 创建 Toast（基于 react-hot-toast 的封装）**

```tsx
import toast from "react-hot-toast";

export function showToast(message: string, type: "success" | "error" | "info" = "info") {
  const styles = {
    success: { background: "var(--student-success-soft)", color: "var(--student-success)" },
    error:   { background: "var(--student-error-soft)", color: "var(--student-error)" },
    info:    { background: "var(--student-primary-soft)", color: "var(--student-primary)" },
  };
  toast(message, {
    style: { ...styles[type], fontSize: "14px", borderRadius: "var(--student-radius-sm)" },
    duration: 3000,
  });
}
```

- [ ] **Step 4: 创建 ThemePicker**

```tsx
import { Button } from "./button";
import { cn } from "@/lib/utils";

const THEMES = [
  { id: "violet", label: "浅紫", color: "#8b5cf6" },
  { id: "blue", label: "蓝色", color: "#3b82f6" },
  { id: "green", label: "绿色", color: "#22c55e" },
  { id: "amber", label: "琥珀", color: "#f59e0b" },
  { id: "rose", label: "玫瑰", color: "#f43f5e" },
] as const;

interface ThemePickerProps {
  current: string;
  onChange: (theme: string) => void;
}

export function ThemePicker({ current, onChange }: ThemePickerProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      {THEMES.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-[var(--student-radius-sm)] border text-sm font-medium transition-all",
            current === t.id
              ? "border-[var(--student-primary)] bg-[var(--student-primary-soft)] text-[var(--student-primary)]"
              : "border-[var(--student-hairline)] text-[var(--student-body)] hover:border-[var(--student-hairline-strong)]"
          )}
        >
          <span className="h-4 w-4 rounded-[var(--student-radius-full)]" style={{ backgroundColor: t.color }} />
          {t.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/student/components/ui/
git commit -m "feat: add Dialog, Table, Toast, ThemePicker components"
```

---

### Task 12: 前端 hooks — useStudentTheme / useStudentProfile / student API

**Files:**
- Create: `frontend/src/features/student/hooks/use-student-theme.ts`
- Create: `frontend/src/features/student/api/student.api.ts`

- [ ] **Step 1: 创建 student.api.ts**

```ts
// frontend/src/features/student/api/student.api.ts
import { authHttp } from "@/api/core/authHttp";

export interface StudentQrVerifyResponse {
  verified: boolean;
  userId?: string;
  name?: string;
  departmentName?: string;
  projectGroupName?: string;
  message?: string;
}

export interface StudentProfile {
  account: { username: string; role: string; createTime: string };
  personnel: {
    userId: string; name: string; gender: number; mobilePhone: string;
    email: string; head: string; departmentName: string;
    projectGroupName: string; userTypeNames: string;
    allowedRoomsDisplayZh: string; hasOfficialRoomPermission: boolean;
    totalExp: number;
  } | null;
  stats: { recentAccessCount: number };
}

export async function verifyQrCode(file: File): Promise<StudentQrVerifyResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await authHttp.post<{ data: StudentQrVerifyResponse }>(
    "/v1/auth/register/student/verify-qr", form,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return res.data.data ?? res.data;
}

export async function registerStudent(userId: string, username: string, password: string) {
  const res = await authHttp.post("/v1/auth/register/student", { userId, username, password });
  return res.data;
}

export async function fetchStudentProfile(): Promise<StudentProfile> {
  const res = await authHttp.get<{ data: StudentProfile }>("/v1/student/profile");
  return res.data.data ?? res.data;
}
```

- [ ] **Step 2: 创建 use-student-theme.ts**

```ts
// frontend/src/features/student/hooks/use-student-theme.ts
import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "student-theme-preference";
const DEFAULT = "violet";

function getStoredTheme(): string {
  try { return localStorage.getItem(STORAGE_KEY) ?? DEFAULT; }
  catch { return DEFAULT; }
}

export function useStudentTheme() {
  const [theme, setThemeState] = useState(DEFAULT);

  useEffect(() => {
    setThemeState(getStoredTheme());
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-student-theme", theme);
  }, [theme]);

  const setTheme = useCallback((t: string) => {
    setThemeState(t);
    try { localStorage.setItem(STORAGE_KEY, t); } catch { /* noop */ }
    document.documentElement.setAttribute("data-student-theme", t);
  }, []);

  return { theme, setTheme };
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/student/api/ frontend/src/features/student/hooks/
git commit -m "feat: add student API client + useStudentTheme hook"
```

---

### Task 13: 前端 layout 组件 — StudentLayout / StudentSidebar / StudentHeader

**Files:**
- Create: `frontend/src/features/student/components/layout/student-layout.tsx`
- Create: `frontend/src/features/student/components/layout/student-sidebar.tsx`
- Create: `frontend/src/features/student/components/layout/student-header.tsx`

- [ ] **Step 1: 创建 StudentSidebar**

```tsx
// frontend/src/features/student/components/layout/student-sidebar.tsx
import { NavLink } from "react-router-dom";
import { Home, FileText, Key, User, Settings, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/student/home", icon: Home, label: "首页" },
  { to: "/student/records", icon: FileText, label: "出入记录" },
  { to: "/student/permissions", icon: Key, label: "门禁权限" },
  { to: "/student/profile", icon: User, label: "个人档案" },
  { to: "/student/settings", icon: Settings, label: "账户设置" },
];

interface StudentSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function StudentSidebar({ collapsed, onToggle }: StudentSidebarProps) {
  return (
    <aside
      className={cn(
        "flex flex-col border-r border-[var(--student-hairline)] bg-[var(--student-canvas)] transition-all duration-200",
        collapsed ? "w-14" : "w-60"
      )}
    >
      <div className="flex items-center justify-end p-2">
        <button onClick={onToggle} className="p-1.5 rounded-[var(--student-radius-sm)] hover:bg-[var(--student-canvas-soft)] text-[var(--student-body)]">
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </button>
      </div>
      <nav className="flex-1 px-2 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-[var(--student-radius-sm)] text-sm font-medium transition-colors",
                isActive
                  ? "bg-[var(--student-primary-soft)] text-[var(--student-primary)] border-l-[3px] border-[var(--student-primary)]"
                  : "text-[var(--student-body)] hover:bg-[var(--student-canvas-soft)] hover:text-[var(--student-ink)] border-l-[3px] border-transparent"
              )
            }
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 2: 创建 StudentHeader**

```tsx
// frontend/src/features/student/components/layout/student-header.tsx
import { Bell, LogOut, Menu } from "lucide-react";
import { Avatar } from "../ui/avatar";
import { authStorage } from "@/features/auth/authStorage";
import { useNavigate } from "react-router-dom";

interface StudentHeaderProps {
  onMenuClick: () => void;
}

export function StudentHeader({ onMenuClick }: StudentHeaderProps) {
  const navigate = useNavigate();
  const userInfo = authStorage.getUserInfo();

  const handleLogout = () => {
    authStorage.clear();
    navigate("/student/login");
  };

  return (
    <header className="flex items-center justify-between h-14 px-4 border-b border-[var(--student-hairline)] bg-[var(--student-canvas)] shrink-0">
      <div className="flex items-center gap-3">
        <button onClick={onMenuClick} className="lg:hidden p-1.5 rounded-[var(--student-radius-sm)] hover:bg-[var(--student-canvas-soft)]">
          <Menu className="h-5 w-5 text-[var(--student-body)]" />
        </button>
        <span className="text-lg font-semibold text-[var(--student-ink)]">学生中心</span>
      </div>
      <div className="flex items-center gap-3">
        <button className="p-1.5 rounded-[var(--student-radius-sm)] hover:bg-[var(--student-canvas-soft)]">
          <Bell className="h-5 w-5 text-[var(--student-body)]" />
        </button>
        <button onClick={handleLogout} className="p-1.5 rounded-[var(--student-radius-sm)] hover:bg-[var(--student-canvas-soft)]">
          <LogOut className="h-5 w-5 text-[var(--student-body)]" />
        </button>
        <Avatar fallback={userInfo?.displayName ?? "?"} size="sm" />
      </div>
    </header>
  );
}
```

- [ ] **Step 3: 创建 StudentLayout**

```tsx
// frontend/src/features/student/components/layout/student-layout.tsx
import { useState } from "react";
import { Outlet } from "react-router-dom";
import { StudentSidebar } from "./student-sidebar";
import { StudentHeader } from "./student-header";

export default function StudentLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen bg-[var(--student-canvas-soft)]">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <StudentSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[1400] lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute left-0 top-0 h-full">
            <StudentSidebar collapsed={false} onToggle={() => setMobileMenuOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <StudentHeader onMenuClick={() => setMobileMenuOpen(true)} />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/student/components/layout/
git commit -m "feat: add StudentLayout with sidebar + header"
```

---

### Task 14: 前端 QR 上传组件 + 注册页面

**Files:**
- Create: `frontend/src/features/student/components/qr/qr-uploader.tsx`
- Create: `frontend/src/features/student/pages/student-register.tsx`
- Create: `frontend/src/features/student/pages/student-login.tsx`

- [ ] **Step 1: 创建 QrUploader 组件**

```tsx
// frontend/src/features/student/components/qr/qr-uploader.tsx
import { useState, useRef } from "react";
import { Upload, Camera, Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "../ui/button";
import { verifyQrCode } from "../../api/student.api";

interface QrUploaderProps {
  onVerified: (data: { userId: string; name: string; departmentName: string; projectGroupName: string }) => void;
}

export function QrUploader({ onVerified }: QrUploaderProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setLoading(true);
    setError("");
    setPreview(URL.createObjectURL(file));
    try {
      const res = await verifyQrCode(file);
      if (res.verified && res.userId && res.name) {
        onVerified({ userId: res.userId, name: res.name, departmentName: res.departmentName ?? "", projectGroupName: res.projectGroupName ?? "" });
      } else {
        setError(res.message ?? "验证失败");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-[var(--student-hairline)] rounded-[var(--student-radius-lg)] p-8 text-center cursor-pointer hover:border-[var(--student-primary)] hover:bg-[var(--student-primary-soft)]/50 transition-colors"
      >
        {preview ? (
          <img src={preview} alt="QR preview" className="max-h-48 mx-auto rounded-[var(--student-radius-sm)]" />
        ) : (
          <div className="space-y-2">
            <Upload className="h-10 w-10 mx-auto text-[var(--student-mute)]" />
            <p className="text-sm text-[var(--student-body)]">点击上传二维码图片</p>
            <p className="text-xs text-[var(--student-mute)]">支持 JPG、PNG 格式</p>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </div>
      {loading && (
        <div className="flex items-center justify-center gap-2 text-sm text-[var(--student-primary)]">
          <Loader2 className="h-4 w-4 animate-spin" /> 识别中...
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 text-sm text-[var(--student-error)] bg-[var(--student-error-soft)] px-3 py-2 rounded-[var(--student-radius-sm)]">
          <XCircle className="h-4 w-4" /> {error}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 创建 StudentRegisterPage（多步骤表单）**

```tsx
// frontend/src/features/student/pages/student-register.tsx
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle } from "lucide-react";
import { QrUploader } from "../components/qr/qr-uploader";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { registerStudent } from "../api/student.api";
import { authStorage } from "@/features/auth/authStorage";
import { showToast } from "../components/ui/toast";

type Step = "qr" | "confirm" | "credentials" | "success";

export default function StudentRegisterPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("qr");
  const [personnel, setPersonnel] = useState<{ userId: string; name: string; departmentName: string; projectGroupName: string } | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [registering, setRegistering] = useState(false);

  const handleVerified = (data: { userId: string; name: string; departmentName: string; projectGroupName: string }) => {
    setPersonnel(data);
    setStep("confirm");
  };

  const handleRegister = async () => {
    if (!personnel) return;
    if (password !== confirmPassword) { showToast("两次密码不一致", "error"); return; }
    if (password.length < 6) { showToast("密码至少6位", "error"); return; }
    setRegistering(true);
    try {
      const res = await registerStudent(personnel.userId, username, password);
      const data = res.data ?? res;
      authStorage.setAuth(data.token, "STUDENT", data.userInfo);
      setStep("success");
      showToast("注册成功！", "success");
      setTimeout(() => navigate("/student/home"), 1500);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "注册失败", "error");
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--student-canvas-soft)] p-4">
      <Card className="w-full max-w-md" padding="lg">
        {step === "qr" && (
          <>
            <h1 className="text-2xl font-semibold text-[var(--student-ink)] mb-2">学生注册</h1>
            <p className="text-sm text-[var(--student-body)] mb-6">请上传你的身份二维码完成验证</p>
            <QrUploader onVerified={handleVerified} />
            <p className="mt-6 text-center text-xs text-[var(--student-mute)]">
              已有账号？<Link to="/student/login" className="text-[var(--student-primary)] hover:underline">去登录</Link>
            </p>
          </>
        )}

        {step === "confirm" && personnel && (
          <>
            <h1 className="text-2xl font-semibold text-[var(--student-ink)] mb-4">确认身份</h1>
            <div className="bg-[var(--student-primary-soft)] rounded-[var(--student-radius-md)] p-4 space-y-2 mb-6">
              <div className="flex items-center gap-2 text-[var(--student-primary)]">
                <CheckCircle className="h-5 w-5" /> <span className="font-medium">身份验证通过</span>
              </div>
              <p className="text-sm text-[var(--student-ink)]">姓名：{personnel.name}</p>
              <p className="text-sm text-[var(--student-ink)]">部门：{personnel.departmentName}</p>
              <p className="text-sm text-[var(--student-ink)]">课题组：{personnel.projectGroupName}</p>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setStep("qr")}>重新验证</Button>
              <Button className="flex-1" onClick={() => setStep("credentials")}>确认，设置账号</Button>
            </div>
          </>
        )}

        {step === "credentials" && (
          <>
            <h1 className="text-2xl font-semibold text-[var(--student-ink)] mb-4">设置账号密码</h1>
            <div className="space-y-4 mb-6">
              <div>
                <label className="text-sm font-medium text-[var(--student-ink)]">用户名</label>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="3-64位字母或数字" className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium text-[var(--student-ink)]">密码</label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少6位" className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium text-[var(--student-ink)]">确认密码</label>
                <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="再次输入密码" className="mt-1" />
              </div>
            </div>
            <Button className="w-full" onClick={handleRegister} disabled={registering}>
              {registering ? "注册中..." : "完成注册"}
            </Button>
          </>
        )}

        {step === "success" && (
          <div className="text-center py-8">
            <CheckCircle className="h-16 w-16 mx-auto text-[var(--student-success)] mb-4" />
            <h2 className="text-xl font-semibold text-[var(--student-ink)] mb-2">注册成功！</h2>
            <p className="text-sm text-[var(--student-body)]">正在跳转到你的个人主页...</p>
          </div>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: 创建 StudentLoginPage**

```tsx
// frontend/src/features/student/pages/student-login.tsx
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { authStorage } from "@/features/auth/authStorage";
import { loginWeb } from "@/api/domains/auth.api";
import { showToast } from "../components/ui/toast";

export default function StudentLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) { showToast("请输入账号和密码", "error"); return; }
    setLoading(true);
    try {
      const res = await loginWeb(username, password);
      const data = res.data ?? res;
      const role = data.role ?? "STUDENT";
      // 仅允许学生角色通过学生端登录
      if (role !== "STUDENT") {
        showToast("请使用教职工登录入口", "error");
        setLoading(false);
        return;
      }
      authStorage.setAuth(data.token, role, data.userInfo);
      navigate("/student/home");
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "登录失败", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--student-canvas-soft)] p-4">
      <Card className="w-full max-w-sm" padding="lg">
        <h1 className="text-2xl font-semibold text-[var(--student-ink)] text-center mb-1">学生登录</h1>
        <p className="text-sm text-[var(--student-body)] text-center mb-6">使用你的账号密码登录</p>
        <div className="space-y-4">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="用户名" />
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="密码"
            onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
          <Button className="w-full" onClick={handleLogin} disabled={loading}>
            {loading ? "登录中..." : "登录"}
          </Button>
        </div>
        <p className="mt-6 text-center text-xs text-[var(--student-mute)]">
          还没有账号？<Link to="/student/register" className="text-[var(--student-primary)] hover:underline">立即注册</Link>
        </p>
        <p className="mt-2 text-center text-xs text-[var(--student-mute)]">
          <Link to="/login" className="hover:underline">教职工登录入口</Link>
        </p>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/student/components/qr/ frontend/src/features/student/pages/
git commit -m "feat: add QrUploader, StudentRegisterPage, StudentLoginPage"
```

---

### Task 15: 前端路由集成 + AuthGuard 增强

**Files:**
- Modify: `frontend/src/router/AuthGuard.tsx`
- Modify: `frontend/src/router/index.tsx`
- Create: `frontend/src/features/student/pages/student-home.tsx`
- Create: `frontend/src/features/student/pages/student-records.tsx`
- Create: `frontend/src/features/student/pages/student-permissions.tsx`
- Create: `frontend/src/features/student/pages/student-profile.tsx`
- Create: `frontend/src/features/student/pages/student-settings.tsx`

- [ ] **Step 1: 增强 AuthGuard 支持 requireRole**

修改 `frontend/src/router/AuthGuard.tsx`：

```tsx
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";

interface AuthGuardProps {
  requireRole?: string;
}

export default function AuthGuard({ requireRole }: AuthGuardProps) {
  const location = useLocation();
  const hasToken = authStorage.hasToken();

  if (!hasToken) {
    const loginPath = requireRole === "STUDENT" ? "/student/login" : "/login";
    return <Navigate to={loginPath} replace state={{ from: location }} />;
  }

  if (requireRole) {
    const role = authStorage.getRole() ?? "STUDENT";
    if (!hasMinRole(role, requireRole)) {
      // 角色不匹配：学生访问 /admin → 重定向到 /student/home
      // 教职工访问 /student → 重定向到 /admin
      const fallback = requireRole === "STUDENT" ? "/admin" : "/student/home";
      const target = role === "STUDENT" ? "/student/home" : fallback;
      return <Navigate to={target} replace />;
    }
  }

  return <Outlet />;
}
```

- [ ] **Step 2: 在 router/index.tsx 中注册学生路由**

在 `frontend/src/router/index.tsx` 中追加 import 和路由：

```tsx
// 新增 imports（追加到文件顶部现有 imports 之后）
import StudentLoginPage from "@/features/student/pages/student-login";
import StudentRegisterPage from "@/features/student/pages/student-register";
import StudentLayout from "@/features/student/components/layout/student-layout";
import StudentHomePage from "@/features/student/pages/student-home";
import StudentRecordsPage from "@/features/student/pages/student-records";
import StudentPermissionsPage from "@/features/student/pages/student-permissions";
import StudentProfilePage from "@/features/student/pages/student-profile";
import StudentSettingsPage from "@/features/student/pages/student-settings";
```

在 `createHashRouter` 数组中追加（在现有 public 路由之后、AuthGuard 之前）：

```tsx
// 学生端公开路由
{ path: "/student/login", element: <StudentLoginPage /> },
{ path: "/student/register", element: <StudentRegisterPage /> },

// 学生端受保护路由
{
  path: "/student",
  element: <AuthGuard requireRole="STUDENT"><StudentLayout /></AuthGuard>,
  children: [
    { index: true, element: <Navigate to="/student/home" replace /> },
    { path: "home", element: <StudentHomePage /> },
    { path: "records", element: <StudentRecordsPage /> },
    { path: "permissions", element: <StudentPermissionsPage /> },
    { path: "profile", element: <StudentProfilePage /> },
    { path: "settings", element: <StudentSettingsPage /> },
  ],
},
```

- [ ] **Step 3: 创建占位页面**

```tsx
// student-home.tsx
export default function StudentHomePage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-[var(--student-ink)] mb-4">欢迎回来</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {["出入记录", "门禁权限", "个人档案"].map((title) => (
          <div key={title} className="bg-[var(--student-canvas)] rounded-[var(--student-radius-md)] p-6 shadow-[var(--student-shadow-card)]">
            <h3 className="font-medium text-[var(--student-ink)] mb-2">{title}</h3>
            <p className="text-sm text-[var(--student-body)]">此模块即将上线</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

```tsx
// student-records.tsx
import { EmptyState } from "../components/ui/empty-state";
import { FileText } from "lucide-react";

export default function StudentRecordsPage() {
  return <EmptyState icon={FileText} title="出入记录" description="此功能即将上线，敬请期待" />;
}
```

```tsx
// student-permissions.tsx
import { EmptyState } from "../components/ui/empty-state";
import { Key } from "lucide-react";

export default function StudentPermissionsPage() {
  return <EmptyState icon={Key} title="门禁权限" description="此功能即将上线，敬请期待" />;
}
```

```tsx
// student-profile.tsx
import { useQuery } from "@tanstack/react-query";
import { fetchStudentProfile } from "../api/student.api";
import { Card } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { ErrorRetry } from "../components/ui/error-retry";
import { Badge } from "../components/ui/badge";
import { Avatar } from "../components/ui/avatar";
import { User, Mail, Phone, Building, Users, Shield } from "lucide-react";

export default function StudentProfilePage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["student", "profile"],
    queryFn: fetchStudentProfile,
  });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-40 w-full" /></div>;
  if (isError) return <ErrorRetry onRetry={() => refetch()} />;
  if (!data?.personnel) return <div className="text-center py-16 text-[var(--student-mute)]">未找到人员档案信息</div>;

  const p = data.personnel;
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold text-[var(--student-ink)]">个人档案</h1>
      <Card padding="lg">
        <div className="flex items-center gap-4 mb-6">
          <Avatar src={p.head} fallback={p.name} size="lg" />
          <div>
            <h2 className="text-xl font-semibold text-[var(--student-ink)]">{p.name}</h2>
            <p className="text-sm text-[var(--student-body)] font-mono">{p.userId}</p>
          </div>
          {p.hasOfficialRoomPermission && <Badge variant="access">官方授权</Badge>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <InfoRow icon={Mail} label="邮箱" value={p.email} />
          <InfoRow icon={Phone} label="手机" value={p.mobilePhone} />
          <InfoRow icon={Building} label="部门" value={p.departmentName} />
          <InfoRow icon={Users} label="课题组" value={p.projectGroupName} />
          <InfoRow icon={Shield} label="人员类型" value={p.userTypeNames} />
          <InfoRow icon={User} label="RPG经验" value={String(p.totalExp ?? 0)} />
        </div>
      </Card>
      {p.allowedRoomsDisplayZh && (
        <Card padding="lg">
          <h3 className="font-medium text-[var(--student-ink)] mb-2">可进入房间</h3>
          <p className="text-sm text-[var(--student-body)]">{p.allowedRoomsDisplayZh}</p>
        </Card>
      )}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="h-4 w-4 text-[var(--student-mute)] shrink-0" />
      <span className="text-[var(--student-body)]">{label}:</span>
      <span className="text-[var(--student-ink)] truncate">{value || "-"}</span>
    </div>
  );
}
```

```tsx
// student-settings.tsx
import { useState } from "react";
import { Card } from "../components/ui/card";
import { ThemePicker } from "../components/ui/theme-picker";
import { useStudentTheme } from "../hooks/use-student-theme";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { showToast } from "../components/ui/toast";
import { changePassword } from "@/api/domains/auth.api";

export default function StudentSettingsPage() {
  const { theme, setTheme } = useStudentTheme();
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [saving, setSaving] = useState(false);

  const handleChangePassword = async () => {
    if (!oldPw || !newPw) { showToast("请填写完整", "error"); return; }
    if (newPw.length < 6) { showToast("新密码至少6位", "error"); return; }
    setSaving(true);
    try {
      await changePassword(oldPw, newPw);
      showToast("密码修改成功", "success");
      setOldPw(""); setNewPw("");
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "修改失败", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold text-[var(--student-ink)]">账户设置</h1>

      <Card padding="lg">
        <h2 className="font-medium text-[var(--student-ink)] mb-3">主题色</h2>
        <ThemePicker current={theme} onChange={setTheme} />
      </Card>

      <Card padding="lg">
        <h2 className="font-medium text-[var(--student-ink)] mb-3">修改密码</h2>
        <div className="space-y-3">
          <Input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} placeholder="当前密码" />
          <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="新密码（至少6位）" />
          <Button onClick={handleChangePassword} disabled={saving}>{saving ? "保存中..." : "修改密码"}</Button>
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: 验证编译**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -30`
Expected: No new errors (可能有一些未使用变量的 warning，修复后重试)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/router/ frontend/src/features/student/pages/
git commit -m "feat: integrate student routes + AuthGuard role enforcement + placeholder pages"
```

---

### Task 16: 后端 postLoginNavigation 学生分流

**Files:**
- Modify: `frontend/src/features/auth/postLoginNavigation.ts`

- [ ] **Step 1: 学生角色分流到 /student/home**

检查 `resolvePostLoginTarget` 函数，在角色判断后增加 STUDENT 分支。找到现有的 `resolveDefaultPathAfterLogin` 或类似函数，添加：

```ts
if (role === "STUDENT") {
  return "/student/home";
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/auth/postLoginNavigation.ts
git commit -m "feat: route STUDENT role to /student/home after login"
```

---

### Task 17: 验证与审查

- [ ] **Step 1: 整体 TypeScript 编译检查**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: 后端编译检查**

Run: `mvn compile -q`
Expected: BUILD SUCCESS

- [ ] **Step 3: 前端 dev server 启动检查**

Run: `cd frontend && npx vite --host 0.0.0.0 &
sleep 5
curl -s http://localhost:5173 | head -5`
Expected: 返回 index.html

- [ ] **Step 4: 隔离规则核对**

检查以下导入是否存在（应为零结果）：

```bash
# 学生组件不应 import 教职工组件
grep -r "from \"@/components/ui/\"" frontend/src/features/student/ --include="*.tsx" --include="*.ts"
grep -r "from \"@/components/admin/\"" frontend/src/features/student/ --include="*.tsx" --include="*.ts"
grep -r "from \"@/features/admin/\"" frontend/src/features/student/ --include="*.tsx" --include="*.ts"
# 预期: 无匹配
```

```bash
# 学生组件不应使用 --twin-* 或 --admin-* CSS 变量
grep -r "\-\-twin-" frontend/src/features/student/ --include="*.tsx" --include="*.ts" --include="*.css"
grep -r "\-\-admin-" frontend/src/features/student/ --include="*.tsx" --include="*.ts" --include="*.css"
# 预期: 无匹配
```

- [ ] **Step 5: Commit final review**

```bash
git add -A
git commit -m "chore: final verification of student portal isolation"
```

---

## 产出文档清单

实施完成后，以下文档应与代码一并提交：

| 文档 | 对应文件 | 状态 |
|------|---------|------|
| STUDENT_DESIGN_SYSTEM.md | `docs/superpowers/specs/2026-05-29-student-portal-design.md` | ✅ 已产出 |
| STUDENT_ARCHITECTURE.md | 本文档（文件结构 + 路由 + 隔离规则） | ✅ 嵌入本文档 |
| STUDENT_ROADMAP.md | 实施阶段（Task 1-17） | ✅ 嵌入本文档 |
| STUDENT_COMPONENT_SPEC.md | Task 8-11（17 个组件 API + 变体） | ✅ 嵌入本文档 |
| STUDENT_API_SPEC.md | Task 2-5（DTO + Controller 接口契约） | ✅ 嵌入本文档 |
