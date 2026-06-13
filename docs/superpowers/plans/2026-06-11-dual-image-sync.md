# 双端图片互通 · 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让小程序（微信云存储）和 Web（Spring Boot 后端）共享同一套图片文件，通过公网云服务器（frp 转发）做文件中转，数据库同时记录两边的 URL。

**Architecture:** 利用现有的 `UploadController`（已通过 frp 在公网可访问），增加 `upload_file_record` 表记录每个文件的 `public_url` 和 `wechat_file_id`。小程序上传时云函数双写（微信云存储 + POST 到后端），Web 上传后云函数异步拉取补填 wechat_file_id。前端新增 `DualImage` 组件统一处理两端渲染。

**Tech Stack:** Java Spring Boot 3.5 + MyBatis + MySQL 8.0 + React TypeScript + Tailwind CSS

**涉及仓库：** 本仓库（后端 + Web 前端）；小程序云函数代码为参考伪代码

---

## 现状分析

### 已有基础设施（无需新增）

| 组件 | 路径 | 说明 |
|------|------|------|
| UploadController | `modules/upload/controller/UploadController.java` | `POST /api/upload` 上传，`GET /api/upload/files/**` 公开读取 |
| UploadFileService | `modules/upload/service/UploadFileService.java` | 文件存于 `uploads/{dateDir}/{uuid}.ext` |
| authHttp | `frontend/src/api/core/authHttp.ts` | baseURL=`/api`，带 JWT Bearer token |
| upload.api.ts | `frontend/src/api/domains/upload.api.ts` | `uploadSingleImage(file)` → `/api/upload` |
| mediaUrl.ts | `frontend/src/utils/mediaUrl.ts` | `isCloudFileId()` / `webImageSrc()` 判断 cloud:// |
| public-base-url | `application.properties` → `app.public-base-url` | 已有配置项，值为空，用于拼接绝对 URL |
| `GET /api/upload/files/**` | `WebMvcConfig.java:39` | 已排除鉴权，公网可直接访问 |

### 当前架构瓶颈

```
小程序图片 → 微信云存储（cloud://xxx）→ Web 端看不到
Web 上传   → 校园网本地 uploads/       → 小程序看不到
```

### 目标架构

```
┌─ 小程序上传 ──────────────────────────────────────────┐
│  ① 上传到微信云存储 → cloud://file_id                   │
│  ② 云函数 POST /api/upload/sync/register               │
│     └─ 带 file + wechat_file_id → 后端存盘 + 写入记录    │
│  数据库: { public_url: "/api/upload/files/...",         │
│            wechat_file_id: "cloud://xxx" }              │
└───────────────────────────────────────────────────────┘

┌─ Web 上传（现有流程增强）──────────────────────────────┐
│  ① POST /api/upload → 存盘 + 写 upload_file_record     │
│  数据库: { public_url: "/api/upload/files/...",         │
│            wechat_file_id: null }                       │
│  ② 云函数轮询 GET /api/upload/records/pending-sync     │
│     → 下载 public_url → 上传微信云 →                   │
│     PUT /api/upload/records/{id}/wechat-file-id         │
│  数据库: { wechat_file_id: "cloud://xxx" } 补填         │
└───────────────────────────────────────────────────────┘
```

---

## 文件结构

```
新增:
  src/main/resources/db/bootstrap-upload-file-record.sql        # DDL
  src/main/java/com/example/demo/modules/upload/
    entity/UploadFileRecord.java                                 # Entity
    mapper/UploadFileRecordMapper.java                           # MyBatis Mapper 接口
    service/UploadFileRecordService.java                         # Service
  src/main/resources/mapper/UploadFileRecordMapper.xml           # Mapper XML
  frontend/src/components/DualImage.tsx                          # 双端图片组件

修改:
  src/main/java/com/example/demo/modules/upload/
    controller/UploadController.java                             # 增强上传 + 新增 sync 端点
  src/main/java/com/example/demo/common/
    bootstrap/EmbeddedTwinSystemCoreDdlBootstrap.java            # 注册新 SQL
    exception/ErrorCodeConstants.java                            # 新增错误码
  src/main/resources/application.properties                      # 配置 public-base-url + sync-secret
  frontend/src/utils/mediaUrl.ts                                 # 新增 dualImageSrc()
  frontend/src/api/domains/upload.api.ts                         # 返回类型增强
```

---

## Task 1: 数据库迁移 — upload_file_record 表

**Files:**
- Create: `src/main/resources/db/bootstrap-upload-file-record.sql`
- Modify: `src/main/java/com/example/demo/common/bootstrap/EmbeddedTwinSystemCoreDdlBootstrap.java`

- [ ] **Step 1: 编写 DDL SQL 文件**

`src/main/resources/db/bootstrap-upload-file-record.sql`:

```sql
CREATE TABLE IF NOT EXISTS `upload_file_record` (
    `id`               BIGINT       NOT NULL AUTO_INCREMENT  COMMENT '主键',
    `storage_key`      VARCHAR(255) NOT NULL                 COMMENT '后端存储相对路径，如 20260611/uuid.jpg',
    `public_url`       VARCHAR(512) NOT NULL                 COMMENT '公网可访问的完整 URL',
    `wechat_file_id`   VARCHAR(512) DEFAULT NULL             COMMENT '微信云存储 fileID（cloud://xxx），Web 上传后由云函数异步补填',
    `original_name`    VARCHAR(255) DEFAULT NULL             COMMENT '原始文件名',
    `mime_type`        VARCHAR(100) DEFAULT NULL             COMMENT 'MIME 类型，如 image/jpeg',
    `size_bytes`       BIGINT       DEFAULT 0               COMMENT '文件大小（字节）',
    `source`           VARCHAR(20)  NOT NULL DEFAULT 'WEB'   COMMENT '来源：WEB / MINIPROGRAM',
    `synced_to_wechat` TINYINT(1)   NOT NULL DEFAULT 0      COMMENT '是否已同步到微信云存储',
    `created_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    INDEX `idx_wechat_file_id` (`wechat_file_id`(255)),
    INDEX `idx_synced_to_wechat` (`synced_to_wechat`),
    INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='上传文件记录表 — 关联微信云存储 fileID 与公网 URL';
```

- [ ] **Step 2: 在 DDL Bootstrap 中注册新 SQL**

修改 `src/main/java/com/example/demo/common/bootstrap/EmbeddedTwinSystemCoreDdlBootstrap.java`，在 `run()` 方法末尾（`bootstrap-smartsheet-pin.sql` 之后）新增一行：

```java
runScript("db/bootstrap-upload-file-record.sql", "upload_file_record（双端图片互通记录表）");
```

插入位置：第 65 行 `runScript("db/bootstrap-smartsheet-pin.sql", ...)` 之后，`}` 之前。

- [ ] **Step 3: 重启后端验证建表**

重启 Spring Boot 后端，检查日志是否出现：
```
[embedded-ddl] 已执行 classpath:db/bootstrap-upload-file-record.sql（upload_file_record（双端图片互通记录表））
```

连接数据库验证：
```sql
DESC upload_file_record;
```

---

## Task 2: Entity + ErrorCodeConstants

**Files:**
- Create: `src/main/java/com/example/demo/modules/upload/entity/UploadFileRecord.java`
- Modify: `src/main/java/com/example/demo/common/exception/ErrorCodeConstants.java`

- [ ] **Step 1: 编写 Entity**

`src/main/java/com/example/demo/modules/upload/entity/UploadFileRecord.java`:

```java
package com.example.demo.modules.upload.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class UploadFileRecord {
    private Long id;
    private String storageKey;
    private String publicUrl;
    private String wechatFileId;
    private String originalName;
    private String mimeType;
    private Long sizeBytes;
    private String source;
    private Boolean syncedToWechat;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
```

- [ ] **Step 2: 新增错误码**

修改 `src/main/java/com/example/demo/common/exception/ErrorCodeConstants.java`，在 `SMARTSHEET_TEMPLATE_NOT_FOUND` 之后添加：

```java
// Upload 1-007-xxx
UPLOAD_FILE_NOT_FOUND = 1_007_001;
UPLOAD_SYNC_SECRET_INVALID = 1_007_002;
```

---

## Task 3: Mapper 接口 + XML

**Files:**
- Create: `src/main/java/com/example/demo/modules/upload/mapper/UploadFileRecordMapper.java`
- Create: `src/main/resources/mapper/UploadFileRecordMapper.xml`

- [ ] **Step 1: 编写 Mapper 接口**

`src/main/java/com/example/demo/modules/upload/mapper/UploadFileRecordMapper.java`:

```java
package com.example.demo.modules.upload.mapper;

import com.example.demo.modules.upload.entity.UploadFileRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface UploadFileRecordMapper {

    int insert(UploadFileRecord record);

    UploadFileRecord selectById(@Param("id") Long id);

    UploadFileRecord selectByStorageKey(@Param("storageKey") String storageKey);

    List<UploadFileRecord> selectPendingSync(@Param("limit") int limit);

    int updateWechatFileId(@Param("id") Long id,
                           @Param("wechatFileId") String wechatFileId,
                           @Param("syncedToWechat") Boolean syncedToWechat);

    int deleteById(@Param("id") Long id);
}
```

- [ ] **Step 2: 编写 Mapper XML**

`src/main/resources/mapper/UploadFileRecordMapper.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
        "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.example.demo.modules.upload.mapper.UploadFileRecordMapper">

    <resultMap id="BaseResultMap" type="com.example.demo.modules.upload.entity.UploadFileRecord">
        <id column="id" property="id"/>
        <result column="storage_key" property="storageKey"/>
        <result column="public_url" property="publicUrl"/>
        <result column="wechat_file_id" property="wechatFileId"/>
        <result column="original_name" property="originalName"/>
        <result column="mime_type" property="mimeType"/>
        <result column="size_bytes" property="sizeBytes"/>
        <result column="source" property="source"/>
        <result column="synced_to_wechat" property="syncedToWechat"/>
        <result column="created_at" property="createdAt"/>
        <result column="updated_at" property="updatedAt"/>
    </resultMap>

    <insert id="insert" parameterType="com.example.demo.modules.upload.entity.UploadFileRecord"
            useGeneratedKeys="true" keyProperty="id">
        INSERT INTO upload_file_record (storage_key, public_url, wechat_file_id,
            original_name, mime_type, size_bytes, source, synced_to_wechat)
        VALUES (#{storageKey}, #{publicUrl}, #{wechatFileId},
            #{originalName}, #{mimeType}, #{sizeBytes}, #{source},
            #{syncedToWechat})
    </insert>

    <select id="selectById" resultMap="BaseResultMap">
        SELECT * FROM upload_file_record WHERE id = #{id}
    </select>

    <select id="selectByStorageKey" resultMap="BaseResultMap">
        SELECT * FROM upload_file_record WHERE storage_key = #{storageKey}
    </select>

    <select id="selectPendingSync" resultMap="BaseResultMap">
        SELECT * FROM upload_file_record
        WHERE synced_to_wechat = 0 AND wechat_file_id IS NULL
        ORDER BY created_at ASC
        LIMIT #{limit}
    </select>

    <update id="updateWechatFileId">
        UPDATE upload_file_record
        SET wechat_file_id = #{wechatFileId},
            synced_to_wechat = #{syncedToWechat}
        WHERE id = #{id}
    </update>

    <delete id="deleteById">
        DELETE FROM upload_file_record WHERE id = #{id}
    </delete>

</mapper>
```

---

## Task 4: UploadFileRecordService

**Files:**
- Create: `src/main/java/com/example/demo/modules/upload/service/UploadFileRecordService.java`

- [ ] **Step 1: 编写 Service**

`src/main/java/com/example/demo/modules/upload/service/UploadFileRecordService.java`:

```java
package com.example.demo.modules.upload.service;

import com.example.demo.modules.upload.entity.UploadFileRecord;
import com.example.demo.modules.upload.mapper.UploadFileRecordMapper;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class UploadFileRecordService {

    private final UploadFileRecordMapper mapper;

    public UploadFileRecordService(UploadFileRecordMapper mapper) {
        this.mapper = mapper;
    }

    public UploadFileRecord create(UploadFileRecord record) {
        mapper.insert(record);
        return record;
    }

    public UploadFileRecord findById(Long id) {
        return mapper.selectById(id);
    }

    public UploadFileRecord findByStorageKey(String storageKey) {
        return mapper.selectByStorageKey(storageKey);
    }

    public List<UploadFileRecord> findPendingSync(int limit) {
        return mapper.selectPendingSync(limit);
    }

    public void markSynced(Long id, String wechatFileId) {
        mapper.updateWechatFileId(id, wechatFileId, true);
    }
}
```

---

## Task 5: 增强 UploadController

**Files:**
- Modify: `src/main/java/com/example/demo/modules/upload/controller/UploadController.java`

- [ ] **Step 1: 修改现有 upload 方法 — 写入 upload_file_record**

在文件保存到磁盘之后，插入 `UploadFileRecord`。修改 `upload()` 方法，在 `Files.copy()` 之后、返回之前，新增 record 写入逻辑。

关键改动点（第 78-80 行替换为）：

```java
// 写入 upload_file_record
UploadFileRecord record = new UploadFileRecord();
record.setStorageKey(dateDir + "/" + fileName);
record.setPublicUrl(buildPublicUrl(dateDir, fileName));
record.setOriginalName(file.getOriginalFilename());
record.setMimeType(file.getContentType());
record.setSizeBytes(file.getSize());
record.setSource("WEB");
record.setSyncedToWechat(false);
uploadFileRecordService.create(record);

Map<String, Object> data = new HashMap<>();
data.put("url", "/api/upload/files/" + dateDir + "/" + fileName);
data.put("publicUrl", record.getPublicUrl());
data.put("recordId", record.getId());
return Result.success(data);
```

- [ ] **Step 2: 新增 buildPublicUrl 辅助方法**

在 `UploadController` 末尾新增：

```java
@Value("${app.public-base-url:}")
private String publicBaseUrl;

private String buildPublicUrl(String dateDir, String fileName) {
    String path = "/api/upload/files/" + dateDir + "/" + fileName;
    if (publicBaseUrl != null && !publicBaseUrl.isBlank()) {
        return publicBaseUrl.replaceAll("/+$", "") + path;
    }
    return path;
}
```

同时需要在类顶部新增 `@Value` 导入和 `UploadFileRecordService` 依赖：

```java
import org.springframework.beans.factory.annotation.Value;
import com.example.demo.modules.upload.entity.UploadFileRecord;
import com.example.demo.modules.upload.service.UploadFileRecordService;

// 构造函数改为：
private final UploadFileRecordService uploadFileRecordService;

public UploadController(AuthContextService authContextService,
                        UploadFileService uploadFileService,
                        UploadFileRecordService uploadFileRecordService) {
    this.authContextService = authContextService;
    this.uploadFileService = uploadFileService;
    this.uploadFileRecordService = uploadFileRecordService;
}
```

- [ ] **Step 3: 新增云函数同步端点 — POST /api/upload/sync/register**

小程序云函数调用，传入文件 + wechat_file_id：

```java
@Value("${app.upload.sync-secret:}")
private String syncSecret;

@PostMapping("/sync/register")
@Operation(summary = "云函数注册文件（从小程序同步到后端）")
public Result<?> syncRegister(
        @RequestHeader(value = "X-Sync-Secret", required = false) String secret,
        @RequestParam(value = "file", required = false) MultipartFile file,
        @RequestParam("wechatFileId") String wechatFileId,
        @RequestParam(value = "originalName", required = false) String originalName,
        @RequestParam(value = "mimeType", required = false) String mimeType) throws Exception {

    if (syncSecret == null || syncSecret.isBlank() || !syncSecret.equals(secret)) {
        return Result.fail(ErrorCodeConstants.UPLOAD_SYNC_SECRET_INVALID, "Sync Secret 无效");
    }
    if (wechatFileId == null || wechatFileId.isBlank()) {
        return Result.error("wechatFileId 不能为空");
    }

    String dateDir = LocalDate.now().toString().replace("-", "");
    String ext = "";
    String fileName = UUID.randomUUID().toString().replace("-", "");

    if (file != null && !file.isEmpty()) {
        // 带文件：存盘
        ext = extractExtension(file.getOriginalFilename());
        if (!ext.isEmpty()) fileName += "." + ext;
        Path baseDir = uploadFileService.resolveBaseDir();
        Path targetDir = baseDir.resolve(dateDir);
        Files.createDirectories(targetDir);
        Path target = targetDir.resolve(fileName);
        try (InputStream inputStream = file.getInputStream()) {
            Files.copy(inputStream, target, StandardCopyOption.REPLACE_EXISTING);
        }
        if (mimeType == null || mimeType.isBlank()) {
            mimeType = file.getContentType();
        }
    } else {
        // 不带文件：仅注册 wechat_file_id（图片已在微信云，后端不存盘）
        // 仍需一条记录用于关联
        fileName = "wechat-only-" + fileName;
    }

    UploadFileRecord record = new UploadFileRecord();
    record.setStorageKey(dateDir + "/" + fileName);
    record.setPublicUrl(buildPublicUrl(dateDir, fileName));
    record.setWechatFileId(wechatFileId);
    record.setOriginalName(originalName != null ? originalName : "mini-program-upload");
    record.setMimeType(mimeType);
    record.setSizeBytes(file != null && !file.isEmpty() ? file.getSize() : 0L);
    record.setSource("MINIPROGRAM");
    record.setSyncedToWechat(true);
    uploadFileRecordService.create(record);

    Map<String, Object> data = new HashMap<>();
    data.put("publicUrl", record.getPublicUrl());
    data.put("recordId", record.getId());
    data.put("wechatFileId", wechatFileId);
    return Result.success(data);
}
```

- [ ] **Step 4: 新增 — GET /api/upload/records/pending-sync**

云函数轮询：找出 Web 上传但尚未同步到微信云的文件：

```java
@GetMapping("/records/pending-sync")
@Operation(summary = "查询待同步到微信云的文件列表（云函数轮询用）")
public Result<?> pendingSync(
        @RequestHeader(value = "X-Sync-Secret", required = false) String secret,
        @RequestParam(value = "limit", defaultValue = "20") int limit) {

    if (syncSecret == null || syncSecret.isBlank() || !syncSecret.equals(secret)) {
        return Result.fail(ErrorCodeConstants.UPLOAD_SYNC_SECRET_INVALID, "Sync Secret 无效");
    }
    List<UploadFileRecord> records = uploadFileRecordService.findPendingSync(Math.min(limit, 100));
    return Result.success(records);
}
```

- [ ] **Step 5: 新增 — PUT /api/upload/records/{id}/wechat-file-id**

云函数上传到微信云后，回填 wechat_file_id：

```java
@PutMapping("/records/{id}/wechat-file-id")
@Operation(summary = "云函数回填微信云 fileID")
public Result<?> updateWechatFileId(
        @RequestHeader(value = "X-Sync-Secret", required = false) String secret,
        @PathVariable("id") Long id,
        @RequestParam("wechatFileId") String wechatFileId) {

    if (syncSecret == null || syncSecret.isBlank() || !syncSecret.equals(secret)) {
        return Result.fail(ErrorCodeConstants.UPLOAD_SYNC_SECRET_INVALID, "Sync Secret 无效");
    }
    UploadFileRecord record = uploadFileRecordService.findById(id);
    if (record == null) {
        return Result.fail(ErrorCodeConstants.UPLOAD_FILE_NOT_FOUND, "文件记录不存在");
    }
    uploadFileRecordService.markSynced(id, wechatFileId);

    Map<String, Object> data = new HashMap<>();
    data.put("id", id);
    data.put("wechatFileId", wechatFileId);
    data.put("synced", true);
    return Result.success(data);
}
```

需要新增 `@PathVariable` 导入：
```java
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
```

---

## Task 6: 配置文件

**Files:**
- Modify: `src/main/resources/application.properties`

- [ ] **Step 1: 设置 public-base-url 和 sync-secret**

在 `src/main/resources/application.properties` 的 upload 相关配置附近添加：

```properties
# 双端图片互通 — 公网访问基址（云函数用此拼接完整下载 URL）
app.public-base-url=http://47.101.61.184:8080

# 双端图片互通 — 云函数同步密钥（防止公网随意调用同步端点）
app.upload.sync-secret=${UPLOAD_SYNC_SECRET:twin-upload-sync-2026}
```

---

## Task 7: 前端 — DualImage 组件

**Files:**
- Create: `frontend/src/components/DualImage.tsx`
- Modify: `frontend/src/utils/mediaUrl.ts`

- [ ] **Step 1: 扩展 mediaUrl.ts 工具函数**

在 `frontend/src/utils/mediaUrl.ts` 末尾新增：

```ts
/**
 * 从 UploadFileRecord 返回数据中选择最适合当前端的图片 src。
 * 浏览器端优先 publicUrl；小程序 webview 无法用 cloud://，直接用 publicUrl。
 */
export function dualImageSrc(params: {
  publicUrl?: string;
  wechatFileId?: string;
  fallback?: string;
}): string | undefined {
  const { publicUrl, wechatFileId, fallback } = params;
  // 浏览器端：publicUrl 可直接访问（wechat cloud:// 不可用）
  if (publicUrl) return publicUrl;
  // 如果只有 wechatFileId（浏览器端无法使用），回退
  if (wechatFileId && !isCloudFileId(wechatFileId)) return wechatFileId;
  return fallback;
}

export type DualImageSource = {
  publicUrl?: string;
  wechatFileId?: string;
};
```

- [ ] **Step 2: 创建 DualImage 组件**

`frontend/src/components/DualImage.tsx`:

```tsx
import { useState } from 'react';
import { dualImageSrc, isCloudFileId, type DualImageSource } from '@/utils/mediaUrl';

interface DualImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  source: DualImageSource;
  fallback?: string;
}

/**
 * 双端图片组件。
 * 浏览器端使用 publicUrl 加载；publicUrl 不可用时尝试 wechatFileId（非 cloud:// 格式方可渲染）。
 * 加载失败时显示 fallback 占位图。
 */
export default function DualImage({ source, fallback, alt, ...rest }: DualImageProps) {
  const src = dualImageSrc({
    publicUrl: source.publicUrl,
    wechatFileId: source.wechatFileId,
    fallback,
  });
  const [error, setError] = useState(false);

  if (!src || error) {
    return (
      <div
        className="flex items-center justify-center bg-[var(--app-color-surface-container)] text-[var(--app-color-text-tertiary)] text-sm"
        style={{ width: rest.width || 80, height: rest.height || 80 }}
        {...rest}
      >
        {alt || '无图片'}
      </div>
    );
  }

  return <img src={src} alt={alt} onError={() => setError(true)} {...rest} />;
}
```

---

## Task 8: 前端 — API 层适配

**Files:**
- Modify: `frontend/src/api/domains/upload.api.ts`

- [ ] **Step 1: 增强返回类型和新增 sync API**

```ts
import { authHttp } from "@/api/core/authHttp";
import type { DualImageSource } from "@/utils/mediaUrl";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

export interface UploadResult {
  url: string;           // 相对路径 /api/upload/files/...
  publicUrl: string;     // 完整公网 URL
  recordId: number;      // upload_file_record.id
}

export async function uploadSingleImage(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await authHttp.post<Result<UploadResult>>("/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.data;
}

/** 将 UploadResult 转为 DualImage 组件可用的 source */
export function toDualSource(r: UploadResult): DualImageSource {
  return { publicUrl: r.publicUrl };
}

/** 查询文件记录 — 可同时拿到 publicUrl 和 wechatFileId */
export async function fetchFileRecord(recordId: number): Promise<DualImageSource> {
  const res = await authHttp.get<Result<DualImageSource>>(`/upload/records/${recordId}`);
  return res.data.data;
}
```

---

## Task 9: 小程序云函数代码（参考实现，不在本仓库）

**说明：** 此部分代码部署在微信小程序云函数中，此处仅提供参考伪代码。两个云函数分别处理：
- A. 小程序上传时双写
- B. 轮询 Web 上传的文件并同步到微信云

- [ ] **云函数 A: miniProgramUpload (上传时双写)**

```js
// 小程序端调用 wx.cloud.uploadFile 后，再调此云函数做后端同步
exports.main = async (event) => {
  const { wechatFileID, originalName, mimeType } = event;

  // 1. 从微信云下载文件到云函数临时空间
  const downloadResult = await cloud.downloadFile({ fileID: wechatFileID });
  const fileBuffer = downloadResult.fileContent;

  // 2. POST 到后端 /api/upload/sync/register（云函数内可用 HTTP，无 HTTPS 限制）
  const FormData = require('form-data');
  const form = new FormData();
  form.append('file', fileBuffer, { filename: originalName || 'image.jpg', contentType: mimeType });
  form.append('wechatFileId', wechatFileID);
  form.append('originalName', originalName || '');
  form.append('mimeType', mimeType || 'image/jpeg');

  const res = await fetch('http://<公网IP>:8080/api/upload/sync/register', {
    method: 'POST',
    headers: { 'X-Sync-Secret': 'twin-upload-sync-2026', ...form.getHeaders() },
    body: form,
  });
  const result = await res.json();

  // 3. 返回双端 URL 给小程序前端
  return {
    wechatFileID,                        // 小程序自己用，秒加载
    publicUrl: result.data.publicUrl,     // 存入数据库给 Web 用
    recordId: result.data.recordId,
  };
};
```

- [ ] **云函数 B: syncWebUploadsToWechat (轮询同步)**

```js
// 定时触发器（建议每 1 分钟触发一次）
exports.main = async () => {
  const SYNC_SECRET = 'twin-upload-sync-2026';
  const PUBLIC_BASE = 'http://<公网IP>:8080';

  // 1. 获取待同步列表
  const listRes = await fetch(`${PUBLIC_BASE}/api/upload/records/pending-sync?limit=20`, {
    headers: { 'X-Sync-Secret': SYNC_SECRET },
  });
  const { data: records } = await listRes.json();

  for (const record of records) {
    try {
      // 2. 从公网服务器下载文件
      const downloadRes = await fetch(`${PUBLIC_BASE}${record.publicUrl}`);
      const buffer = await downloadRes.buffer();

      // 3. 上传到微信云存储
      const cloudUpload = await cloud.uploadFile({
        cloudPath: `sync/${record.storageKey}`,
        fileContent: buffer,
      });

      // 4. 回填 wechat_file_id
      await fetch(`${PUBLIC_BASE}/api/upload/records/${record.id}/wechat-file-id`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Sync-Secret': SYNC_SECRET },
        body: `wechatFileId=${encodeURIComponent(cloudUpload.fileID)}`,
      });

      console.log(`同步完成: record ${record.id} → ${cloudUpload.fileID}`);
    } catch (err) {
      console.error(`同步失败 record ${record.id}:`, err.message);
    }
  }
  return { synced: records.length };
};
```

---

## 验证清单

- [ ] 后端重启后 `upload_file_record` 表自动创建
- [ ] `POST /api/upload` 上传文件后，数据库新增一条记录（source=WEB, synced_to_wechat=false）
- [ ] `POST /api/upload/sync/register` 云函数带文件注册后，数据库新增记录（source=MINIPROGRAM, synced_to_wechat=true）
- [ ] `GET /api/upload/records/pending-sync` 正确返回 synced_to_wechat=0 的记录
- [ ] `PUT /api/upload/records/{id}/wechat-file-id` 正确更新 wechat_file_id
- [ ] 同步端点不带 `X-Sync-Secret` 返回 1_007_002 错误
- [ ] `GET /api/upload/files/**` 仍然公开可访问（现有行为不变）
- [ ] 前端 `DualImage` 组件可渲染 publicUrl（浏览器端）、正确降级（cloud:// 不可用时）
- [ ] 现有上传功能不受影响（返回体增加了 publicUrl/recordId 字段，但 url 字段不变）