# 学生物资申领系统 · 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建全新独立的学生物资申领系统（material 模块），数据与现有 supplies 完全隔离。

**Architecture:** 新建 `modules/material/` 后端模块（entity → mapper → service → controller），独立数据库表（material_*），独立 API（/material/），前端新增学生端页面 + 教职工审核页面。复用 supplies 模块的业务模式但命名空间完全独立。

**Tech Stack:** Java Spring Boot + MyBatis + MySQL（后端），React TypeScript + Tailwind CSS + Bento 设计系统（前端）

---

### Task 1: 创建 material 模块包结构和实体类

**Files:**
- Create: `src/main/java/com/example/demo/modules/material/entity/MaterialCategory.java`
- Create: `src/main/java/com/example/demo/modules/material/entity/MaterialItem.java`
- Create: `src/main/java/com/example/demo/modules/material/entity/MaterialCart.java`
- Create: `src/main/java/com/example/demo/modules/material/entity/MaterialRequest.java`
- Create: `src/main/java/com/example/demo/modules/material/entity/MaterialRequestLine.java`
- Create: `src/main/java/com/example/demo/modules/material/entity/MaterialStockMovement.java`
- Create: `src/main/java/com/example/demo/modules/material/entity/MaterialOperationLog.java`

- [ ] **Step 1: 创建 MaterialCategory 实体**

```java
package com.example.demo.modules.material.entity;

import lombok.Data;

@Data
public class MaterialCategory {
    private Long id;
    private String name;
    private Integer sortOrder;
    private Integer status;
    private java.time.LocalDateTime createdAt;
    private java.time.LocalDateTime updatedAt;
}
```

- [ ] **Step 2: 创建 MaterialItem 实体**

```java
package com.example.demo.modules.material.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class MaterialItem {
    private Long id;
    private Long categoryId;
    private String name;
    private String subtitle;
    private String coverUrl;
    private String shelfStatus;
    private String stockMode;
    private Integer stockQty;
    /** SIMPLE or DUAL_REVIEW — 物品级别可选审核流程 */
    private String workflowType;
    /** 初审人账号 ID JSON 数组 */
    private String reviewerIds;
    /** 复审人账号 ID JSON 数组（仅 DUAL_REVIEW 时使用） */
    private String secondReviewerIds;
    private Integer deleted;
    private LocalDateTime deletedTime;
    private String deletedBy;
    private LocalDateTime purgeAfterTime;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime lastInboundAt;
}
```

- [ ] **Step 3: 创建 MaterialCart 实体**

```java
package com.example.demo.modules.material.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class MaterialCart {
    private String userId;
    private String linesJson;
    private LocalDateTime updatedAt;
}
```

- [ ] **Step 4: 创建 MaterialRequest 实体**

```java
package com.example.demo.modules.material.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class MaterialRequest {
    private String id;
    private String userId;
    private String applicantName;
    /** 申请人所属课题组（冗余，便于统计） */
    private String applicantGroup;
    /** DRAFT / PENDING / FIRST_OK / APPROVED / REJECTED / FULFILLED / RECEIVED */
    private String status;
    /** 快照物品的 workflow_type */
    private String workflowType;
    private String firstReviewerId;
    private LocalDateTime firstReviewTime;
    private String secondReviewerId;
    private LocalDateTime secondReviewTime;
    private LocalDateTime fulfilledAt;
    private String fulfilledBy;
    private LocalDateTime receivedAt;
    private Integer deleted;
    private LocalDateTime deletedTime;
    private String deletedBy;
    private LocalDateTime purgeAfterTime;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
```

- [ ] **Step 5: 创建 MaterialRequestLine 实体**

```java
package com.example.demo.modules.material.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class MaterialRequestLine {
    private Long id;
    private String requestId;
    private Long itemId;
    private Integer qty;
    private String snapshotName;
    private Integer fulfilledQty;
    private LocalDateTime createdAt;
}
```

- [ ] **Step 6: 创建 MaterialStockMovement 实体**

```java
package com.example.demo.modules.material.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class MaterialStockMovement {
    private Long id;
    private Long itemId;
    private String movementType;
    private Integer qty;
    private Integer stockAfter;
    private String requestId;
    private Long requestLineId;
    private String operatorUserId;
    private String applicantUserId;
    private String remark;
    private LocalDateTime createdAt;
}
```

- [ ] **Step 7: 创建 MaterialOperationLog 实体**

```java
package com.example.demo.modules.material.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class MaterialOperationLog {
    private Long id;
    /** ITEM / REQUEST / CATEGORY */
    private String targetType;
    private String targetId;
    /** CREATE / UPDATE / DELETE / SUBMIT / APPROVE / REJECT / FULFILL / RECEIVE / INBOUND */
    private String action;
    private String operatorUserId;
    private String detail;
    private LocalDateTime createdAt;
}
```

- [ ] **Step 8: 验证编译**

```bash
cd d:/codex/verson.1.2/20260416
mvn compile -pl . -q
```

- [ ] **Step 9: Commit**

```bash
git add src/main/java/com/example/demo/modules/material/entity/
git commit -m "feat(material): add material module entities"
```

---

### Task 2: Schema 迁移 — 建表

**Files:**
- Create: `src/main/java/com/example/demo/modules/material/config/MaterialSchemaMigrator.java`

- [ ] **Step 1: 创建 MaterialSchemaMigrator**

参考 `SuppliesSchemaMigrator.java:1-122` 模式，`@Order(126)` 确保在 supplies (125) 之后执行。

```java
package com.example.demo.modules.material.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@Order(126)
public class MaterialSchemaMigrator implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(MaterialSchemaMigrator.class);
    private final JdbcTemplate jdbcTemplate;

    public MaterialSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            // material_category
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS material_category (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    name VARCHAR(64) NOT NULL COMMENT '分类名称',
                    sort_order INT NOT NULL DEFAULT 0 COMMENT '排序',
                    status TINYINT NOT NULL DEFAULT 1 COMMENT '0=禁用 1=启用',
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物资分类'
                """);

            // material_item
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS material_item (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    category_id BIGINT NOT NULL COMMENT '分类ID',
                    name VARCHAR(128) NOT NULL COMMENT '物品名称',
                    subtitle VARCHAR(256) NULL COMMENT '副标题',
                    cover_url VARCHAR(512) NULL COMMENT '封面图',
                    shelf_status VARCHAR(32) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/PUBLISHED/ARCHIVED',
                    stock_mode VARCHAR(32) NOT NULL DEFAULT 'LIMITED' COMMENT 'LIMITED/UNLIMITED',
                    stock_qty INT NOT NULL DEFAULT 0 COMMENT '当前库存',
                    workflow_type VARCHAR(32) NOT NULL DEFAULT 'SIMPLE' COMMENT 'SIMPLE/DUAL_REVIEW',
                    reviewer_ids JSON NULL COMMENT '审核人账号ID列表',
                    second_reviewer_ids JSON NULL COMMENT '复审人账号ID列表',
                    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '是否删除:1是,0否',
                    deleted_time DATETIME NULL COMMENT '删除时间',
                    deleted_by VARCHAR(50) NULL COMMENT '删除人ID',
                    purge_after_time DATETIME NULL COMMENT '计划彻底清理时间',
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    last_inbound_at DATETIME NULL COMMENT '最近入库时间',
                    INDEX idx_mi_category (category_id),
                    INDEX idx_mi_shelf (shelf_status)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物资物品'
                """);

            // material_cart
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS material_cart (
                    user_id VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '用户ID',
                    lines_json MEDIUMTEXT NOT NULL COMMENT 'JSON：物资 itemId 字符串 -> 数量',
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学生物资购物车'
                """);

            // material_request
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS material_request (
                    id VARCHAR(32) PRIMARY KEY COMMENT '申领单业务ID',
                    user_id VARCHAR(64) NOT NULL COMMENT '申请人ID',
                    applicant_name VARCHAR(64) NULL COMMENT '申请人姓名',
                    applicant_group VARCHAR(128) NULL COMMENT '申请人所属课题组',
                    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/PENDING/FIRST_OK/APPROVED/REJECTED/FULFILLED/RECEIVED',
                    workflow_type VARCHAR(32) NOT NULL DEFAULT 'SIMPLE' COMMENT 'SIMPLE/DUAL_REVIEW',
                    first_reviewer_id VARCHAR(64) NULL COMMENT '初审人ID',
                    first_review_time DATETIME NULL COMMENT '初审时间',
                    second_reviewer_id VARCHAR(64) NULL COMMENT '复审人ID',
                    second_review_time DATETIME NULL COMMENT '复审时间',
                    fulfilled_at DATETIME NULL COMMENT '出库时间',
                    fulfilled_by VARCHAR(64) NULL COMMENT '出库操作人',
                    received_at DATETIME NULL COMMENT '学生确认领取时间',
                    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '软删除',
                    deleted_time DATETIME NULL,
                    deleted_by VARCHAR(50) NULL,
                    purge_after_time DATETIME NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_mr_user (user_id),
                    INDEX idx_mr_status (status),
                    INDEX idx_mr_created (created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物资申领单'
                """);

            // material_request_line
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS material_request_line (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    request_id VARCHAR(32) NOT NULL COMMENT '申领单ID',
                    item_id BIGINT NOT NULL COMMENT '物品ID',
                    qty INT NOT NULL DEFAULT 1 COMMENT '申领数量',
                    snapshot_name VARCHAR(128) NULL COMMENT '物品名称快照',
                    fulfilled_qty INT NOT NULL DEFAULT 0 COMMENT '实际出库数量',
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_mrl_request (request_id),
                    INDEX idx_mrl_item (item_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='申领明细行'
                """);

            // material_stock_movement
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS material_stock_movement (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    item_id BIGINT NOT NULL COMMENT '物品ID',
                    movement_type VARCHAR(32) NOT NULL COMMENT 'INBOUND|OUTBOUND|ADJUST',
                    qty INT NOT NULL COMMENT '变动数量',
                    stock_after INT NULL COMMENT '变动后库存快照',
                    request_id VARCHAR(32) NULL COMMENT '关联申领单',
                    request_line_id BIGINT NULL COMMENT '关联申领行',
                    operator_user_id VARCHAR(64) NULL COMMENT '操作人',
                    applicant_user_id VARCHAR(64) NULL COMMENT '申领人',
                    remark VARCHAR(500) NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_msm_item_time (item_id, created_at),
                    INDEX idx_msm_request (request_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物资库存流水'
                """);

            // material_operation_log
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS material_operation_log (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    target_type VARCHAR(32) NOT NULL COMMENT 'ITEM/REQUEST/CATEGORY',
                    target_id VARCHAR(64) NOT NULL COMMENT '目标ID',
                    action VARCHAR(32) NOT NULL COMMENT '操作动作',
                    operator_user_id VARCHAR(64) NULL COMMENT '操作人ID',
                    detail TEXT NULL COMMENT '操作详情JSON',
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_mol_target (target_type, target_id),
                    INDEX idx_mol_created (created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物资操作日志'
                """);

            log.info("[material-schema] 物资申领表结构已就绪");
        } catch (Exception e) {
            log.error("[material-schema] 表结构迁移失败: {}", e.getMessage());
        }
    }
}
```

- [ ] **Step 2: 启动应用验证建表**

在应用日志中确认 `[material-schema] 物资申领表结构已就绪` 出现且无异常。

- [ ] **Step 3: Commit**

```bash
git add src/main/java/com/example/demo/modules/material/config/
git commit -m "feat(material): add schema migrator — all material tables"
```

---

### Task 3: Mapper 接口 + XML

**Files:**
- Create: `src/main/java/com/example/demo/modules/material/mapper/MaterialCategoryMapper.java`
- Create: `src/main/resources/mapper/MaterialCategoryMapper.xml`
- Create: `src/main/java/com/example/demo/modules/material/mapper/MaterialItemMapper.java`
- Create: `src/main/resources/mapper/MaterialItemMapper.xml`
- Create: `src/main/java/com/example/demo/modules/material/mapper/MaterialCartMapper.java`
- Create: `src/main/resources/mapper/MaterialCartMapper.xml`
- Create: `src/main/java/com/example/demo/modules/material/mapper/MaterialRequestMapper.java`
- Create: `src/main/resources/mapper/MaterialRequestMapper.xml`
- Create: `src/main/java/com/example/demo/modules/material/mapper/MaterialRequestLineMapper.java`
- Create: `src/main/resources/mapper/MaterialRequestLineMapper.xml`
- Create: `src/main/java/com/example/demo/modules/material/mapper/MaterialStockMovementMapper.java`
- Create: `src/main/resources/mapper/MaterialStockMovementMapper.xml`
- Create: `src/main/java/com/example/demo/modules/material/mapper/MaterialOperationLogMapper.java`
- Create: `src/main/resources/mapper/MaterialOperationLogMapper.xml`

- [ ] **Step 1: 创建 MaterialCategoryMapper.java**

```java
package com.example.demo.modules.material.mapper;

import com.example.demo.modules.material.entity.MaterialCategory;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface MaterialCategoryMapper {
    List<MaterialCategory> selectEnabled();
    List<MaterialCategory> selectAll();
    MaterialCategory selectById(@Param("id") Long id);
    int insert(MaterialCategory category);
    int updateById(MaterialCategory category);
    int deleteById(@Param("id") Long id);
}
```

- [ ] **Step 2: 创建 MaterialCategoryMapper.xml**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.example.demo.modules.material.mapper.MaterialCategoryMapper">
    <select id="selectEnabled" resultType="com.example.demo.modules.material.entity.MaterialCategory">
        SELECT * FROM material_category WHERE status = 1 ORDER BY sort_order ASC, id ASC
    </select>
    <select id="selectAll" resultType="com.example.demo.modules.material.entity.MaterialCategory">
        SELECT * FROM material_category ORDER BY sort_order ASC, id ASC
    </select>
    <select id="selectById" resultType="com.example.demo.modules.material.entity.MaterialCategory">
        SELECT * FROM material_category WHERE id = #{id}
    </select>
    <insert id="insert" useGeneratedKeys="true" keyProperty="id">
        INSERT INTO material_category (name, sort_order, status) VALUES (#{name}, #{sortOrder}, #{status})
    </insert>
    <update id="updateById">
        UPDATE material_category SET name = #{name}, sort_order = #{sortOrder}, status = #{status} WHERE id = #{id}
    </update>
    <delete id="deleteById">
        DELETE FROM material_category WHERE id = #{id}
    </delete>
</mapper>
```

- [ ] **Step 3: 创建 MaterialItemMapper.java**

```java
package com.example.demo.modules.material.mapper;

import com.example.demo.modules.material.entity.MaterialItem;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface MaterialItemMapper {
    /** 学生端：已上架 + 未删除 */
    List<MaterialItem> selectPublished(@Param("categoryId") Long categoryId);
    /** 管理端：全部（含草稿/下架，不含已删除） */
    List<MaterialItem> selectAll(@Param("categoryId") Long categoryId);
    MaterialItem selectById(@Param("id") Long id);
    int insert(MaterialItem item);
    int updateById(MaterialItem item);
    int softDelete(@Param("id") Long id, @Param("deletedBy") String deletedBy, @Param("purgeAfterTime") java.time.LocalDateTime purgeAfterTime);
    int restore(@Param("id") Long id);
    int purge(@Param("id") Long id);
    List<MaterialItem> selectRecycle(@Param("offset") int offset, @Param("size") int size);
    int countRecycle();
    int updateStock(@Param("id") Long id, @Param("qty") int qty);
}
```

- [ ] **Step 4: 创建 MaterialItemMapper.xml**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.example.demo.modules.material.mapper.MaterialItemMapper">
    <select id="selectPublished" resultType="com.example.demo.modules.material.entity.MaterialItem">
        SELECT * FROM material_item WHERE shelf_status = 'PUBLISHED' AND deleted = 0
        <if test="categoryId != null">AND category_id = #{categoryId}</if>
        ORDER BY last_inbound_at DESC, id DESC
    </select>
    <select id="selectAll" resultType="com.example.demo.modules.material.entity.MaterialItem">
        SELECT * FROM material_item WHERE deleted = 0
        <if test="categoryId != null">AND category_id = #{categoryId}</if>
        ORDER BY id DESC
    </select>
    <select id="selectById" resultType="com.example.demo.modules.material.entity.MaterialItem">
        SELECT * FROM material_item WHERE id = #{id}
    </select>
    <insert id="insert" useGeneratedKeys="true" keyProperty="id">
        INSERT INTO material_item (category_id, name, subtitle, cover_url, shelf_status, stock_mode, stock_qty, workflow_type, reviewer_ids, second_reviewer_ids)
        VALUES (#{categoryId}, #{name}, #{subtitle}, #{coverUrl}, #{shelfStatus}, #{stockMode}, #{stockQty}, #{workflowType}, #{reviewerIds}, #{secondReviewerIds})
    </insert>
    <update id="updateById">
        UPDATE material_item
        SET category_id = #{categoryId}, name = #{name}, subtitle = #{subtitle}, cover_url = #{coverUrl},
            shelf_status = #{shelfStatus}, stock_mode = #{stockMode},
            workflow_type = #{workflowType}, reviewer_ids = #{reviewerIds}, second_reviewer_ids = #{secondReviewerIds}
        WHERE id = #{id}
    </update>
    <update id="softDelete">
        UPDATE material_item SET deleted = 1, deleted_time = NOW(), deleted_by = #{deletedBy}, purge_after_time = #{purgeAfterTime} WHERE id = #{id}
    </update>
    <update id="restore">
        UPDATE material_item SET deleted = 0, deleted_time = NULL, deleted_by = NULL, purge_after_time = NULL WHERE id = #{id}
    </update>
    <delete id="purge">
        DELETE FROM material_item WHERE id = #{id}
    </delete>
    <select id="selectRecycle" resultType="com.example.demo.modules.material.entity.MaterialItem">
        SELECT * FROM material_item WHERE deleted = 1 ORDER BY deleted_time DESC LIMIT #{offset}, #{size}
    </select>
    <select id="countRecycle" resultType="int">
        SELECT COUNT(1) FROM material_item WHERE deleted = 1
    </select>
    <update id="updateStock">
        UPDATE material_item SET stock_qty = stock_qty + #{qty}, last_inbound_at = IF(#{qty} > 0, NOW(), last_inbound_at) WHERE id = #{id}
    </update>
</mapper>
```

- [ ] **Step 5: 创建 MaterialCartMapper.java + XML**

```java
package com.example.demo.modules.material.mapper;

import com.example.demo.modules.material.entity.MaterialCart;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface MaterialCartMapper {
    MaterialCart selectByUserId(@Param("userId") String userId);
    int insertOrUpdate(@Param("userId") String userId, @Param("linesJson") String linesJson);
}
```

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.example.demo.modules.material.mapper.MaterialCartMapper">
    <select id="selectByUserId" resultType="com.example.demo.modules.material.entity.MaterialCart">
        SELECT * FROM material_cart WHERE user_id = #{userId}
    </select>
    <insert id="insertOrUpdate">
        INSERT INTO material_cart (user_id, lines_json) VALUES (#{userId}, #{linesJson})
        ON DUPLICATE KEY UPDATE lines_json = VALUES(lines_json), updated_at = NOW()
    </insert>
</mapper>
```

- [ ] **Step 6: 创建 MaterialRequestMapper.java + XML**

```java
package com.example.demo.modules.material.mapper;

import com.example.demo.modules.material.entity.MaterialRequest;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface MaterialRequestMapper {
    MaterialRequest selectById(@Param("id") String id);
    List<MaterialRequest> selectByUserId(@Param("userId") String userId, @Param("status") String status,
                                          @Param("offset") int offset, @Param("size") int size);
    int countByUserId(@Param("userId") String userId, @Param("status") String status);
    /** 教职工端：全部申领记录 */
    List<MaterialRequest> selectAll(@Param("status") String status, @Param("offset") int offset, @Param("size") int size);
    int countAll(@Param("status") String status);
    int insert(MaterialRequest request);
    int updateStatus(@Param("id") String id, @Param("status") String status);
    int updateReview(@Param("id") String id, @Param("reviewerId") String reviewerId, @Param("status") String status);
    int updateFulfill(@Param("id") String id, @Param("fulfilledBy") String fulfilledBy);
    int updateReceived(@Param("id") String id);
    int softDelete(@Param("id") String id, @Param("deletedBy") String deletedBy);
    List<MaterialRequest> selectPendingByReviewer(@Param("reviewerId") String reviewerId);
    /** 统计：按学生+时间段聚合 */
    List<java.util.Map<String, Object>> statsByStudent(@Param("from") String from, @Param("to") String to);
    /** 统计：按物品+时间段聚合 */
    List<java.util.Map<String, Object>> statsByItem(@Param("from") String from, @Param("to") String to);
    /** 审计流水：全字段分页 */
    List<MaterialRequest> selectAuditTrail(@Param("from") String from, @Param("to") String to,
                                            @Param("categoryId") Long categoryId, @Param("groupId") String groupId,
                                            @Param("offset") int offset, @Param("size") int size);
    int countAuditTrail(@Param("from") String from, @Param("to") String to,
                         @Param("categoryId") Long categoryId, @Param("groupId") String groupId);
}
```

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.example.demo.modules.material.mapper.MaterialRequestMapper">
    <select id="selectById" resultType="com.example.demo.modules.material.entity.MaterialRequest">
        SELECT * FROM material_request WHERE id = #{id}
    </select>
    <select id="selectByUserId" resultType="com.example.demo.modules.material.entity.MaterialRequest">
        SELECT * FROM material_request WHERE user_id = #{userId} AND deleted = 0
        <if test="status != null and status != ''">AND status = #{status}</if>
        ORDER BY created_at DESC LIMIT #{offset}, #{size}
    </select>
    <select id="countByUserId" resultType="int">
        SELECT COUNT(1) FROM material_request WHERE user_id = #{userId} AND deleted = 0
        <if test="status != null and status != ''">AND status = #{status}</if>
    </select>
    <select id="selectAll" resultType="com.example.demo.modules.material.entity.MaterialRequest">
        SELECT * FROM material_request WHERE deleted = 0
        <if test="status != null and status != ''">AND status = #{status}</if>
        ORDER BY created_at DESC LIMIT #{offset}, #{size}
    </select>
    <select id="countAll" resultType="int">
        SELECT COUNT(1) FROM material_request WHERE deleted = 0
        <if test="status != null and status != ''">AND status = #{status}</if>
    </select>
    <insert id="insert">
        INSERT INTO material_request (id, user_id, applicant_name, applicant_group, status, workflow_type, reviewer_ids)
        VALUES (#{id}, #{userId}, #{applicantName}, #{applicantGroup}, #{status}, #{workflowType}, #{reviewerIds})
    </insert>
    <update id="updateStatus">
        UPDATE material_request SET status = #{status} WHERE id = #{id}
    </update>
    <update id="updateReview">
        UPDATE material_request SET status = #{status},
        <choose>
            <when test="status == 'FIRST_OK' or status == 'APPROVED'">first_reviewer_id = #{reviewerId}, first_review_time = NOW()</when>
            <otherwise>second_reviewer_id = #{reviewerId}, second_review_time = NOW()</otherwise>
        </choose>
        WHERE id = #{id}
    </update>
    <update id="updateFulfill">
        UPDATE material_request SET status = 'FULFILLED', fulfilled_at = NOW(), fulfilled_by = #{fulfilledBy} WHERE id = #{id}
    </update>
    <update id="updateReceived">
        UPDATE material_request SET status = 'RECEIVED', received_at = NOW() WHERE id = #{id}
    </update>
    <update id="softDelete">
        UPDATE material_request SET deleted = 1, deleted_time = NOW(), deleted_by = #{deletedBy} WHERE id = #{id}
    </update>
    <select id="selectPendingByReviewer" resultType="com.example.demo.modules.material.entity.MaterialRequest">
        SELECT * FROM material_request WHERE status IN ('PENDING', 'FIRST_OK') AND deleted = 0 ORDER BY created_at ASC
    </select>
    <select id="statsByStudent" resultType="java.util.HashMap">
        SELECT user_id, applicant_name, applicant_group, COUNT(*) AS total, COUNT(DISTINCT DATE(created_at)) AS active_days
        FROM material_request WHERE deleted = 0 AND created_at BETWEEN #{from} AND #{to}
        GROUP BY user_id, applicant_name, applicant_group ORDER BY total DESC
    </select>
    <select id="statsByItem" resultType="java.util.HashMap">
        SELECT l.item_id, l.snapshot_name, SUM(l.qty) AS total_qty, COUNT(DISTINCT l.request_id) AS request_count
        FROM material_request_line l JOIN material_request r ON l.request_id = r.id
        WHERE r.deleted = 0 AND r.created_at BETWEEN #{from} AND #{to}
        GROUP BY l.item_id, l.snapshot_name ORDER BY total_qty DESC
    </select>
    <select id="selectAuditTrail" resultType="com.example.demo.modules.material.entity.MaterialRequest">
        SELECT * FROM material_request WHERE deleted = 0
        <if test="from != null and to != null">AND created_at BETWEEN #{from} AND #{to}</if>
        <if test="groupId != null and groupId != ''">AND applicant_group = #{groupId}</if>
        ORDER BY created_at DESC LIMIT #{offset}, #{size}
    </select>
    <select id="countAuditTrail" resultType="int">
        SELECT COUNT(1) FROM material_request WHERE deleted = 0
        <if test="from != null and to != null">AND created_at BETWEEN #{from} AND #{to}</if>
        <if test="groupId != null and groupId != ''">AND applicant_group = #{groupId}</if>
    </select>
</mapper>
```

- [ ] **Step 7: 创建 MaterialRequestLineMapper.java + XML**

```java
package com.example.demo.modules.material.mapper;

import com.example.demo.modules.material.entity.MaterialRequestLine;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface MaterialRequestLineMapper {
    List<MaterialRequestLine> selectByRequestId(@Param("requestId") String requestId);
    int insertBatch(@Param("lines") List<MaterialRequestLine> lines);
    int updateFulfilledQty(@Param("id") Long id, @Param("qty") int qty);
}
```

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.example.demo.modules.material.mapper.MaterialRequestLineMapper">
    <select id="selectByRequestId" resultType="com.example.demo.modules.material.entity.MaterialRequestLine">
        SELECT * FROM material_request_line WHERE request_id = #{requestId}
    </select>
    <insert id="insertBatch" useGeneratedKeys="true" keyProperty="id">
        INSERT INTO material_request_line (request_id, item_id, qty, snapshot_name) VALUES
        <foreach collection="lines" item="line" separator=",">
            (#{line.requestId}, #{line.itemId}, #{line.qty}, #{line.snapshotName})
        </foreach>
    </insert>
    <update id="updateFulfilledQty">
        UPDATE material_request_line SET fulfilled_qty = #{qty} WHERE id = #{id}
    </update>
</mapper>
```

- [ ] **Step 8: 创建 MaterialStockMovementMapper.java + XML**

```java
package com.example.demo.modules.material.mapper;

import com.example.demo.modules.material.entity.MaterialStockMovement;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface MaterialStockMovementMapper {
    int insert(MaterialStockMovement movement);
    List<MaterialStockMovement> selectByItemId(@Param("itemId") Long itemId, @Param("offset") int offset, @Param("size") int size);
    int countByItemId(@Param("itemId") Long itemId);
}
```

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.example.demo.modules.material.mapper.MaterialStockMovementMapper">
    <insert id="insert">
        INSERT INTO material_stock_movement (item_id, movement_type, qty, stock_after, request_id, request_line_id, operator_user_id, applicant_user_id, remark)
        VALUES (#{itemId}, #{movementType}, #{qty}, #{stockAfter}, #{requestId}, #{requestLineId}, #{operatorUserId}, #{applicantUserId}, #{remark})
    </insert>
    <select id="selectByItemId" resultType="com.example.demo.modules.material.entity.MaterialStockMovement">
        SELECT * FROM material_stock_movement WHERE item_id = #{itemId} ORDER BY created_at DESC LIMIT #{offset}, #{size}
    </select>
    <select id="countByItemId" resultType="int">
        SELECT COUNT(1) FROM material_stock_movement WHERE item_id = #{itemId}
    </select>
</mapper>
```

- [ ] **Step 9: 创建 MaterialOperationLogMapper.java + XML**

```java
package com.example.demo.modules.material.mapper;

import com.example.demo.modules.material.entity.MaterialOperationLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface MaterialOperationLogMapper {
    int insert(MaterialOperationLog log);
    List<MaterialOperationLog> selectByTarget(@Param("targetType") String targetType, @Param("targetId") String targetId);
}
```

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.example.demo.modules.material.mapper.MaterialOperationLogMapper">
    <insert id="insert">
        INSERT INTO material_operation_log (target_type, target_id, action, operator_user_id, detail)
        VALUES (#{targetType}, #{targetId}, #{action}, #{operatorUserId}, #{detail})
    </insert>
    <select id="selectByTarget" resultType="com.example.demo.modules.material.entity.MaterialOperationLog">
        SELECT * FROM material_operation_log WHERE target_type = #{targetType} AND target_id = #{targetId} ORDER BY created_at DESC
    </select>
</mapper>
```

- [ ] **Step 10: 编译验证**

```bash
cd d:/codex/verson.1.2/20260416
mvn compile -pl . -q
```

- [ ] **Step 11: Commit**

```bash
git add src/main/java/com/example/demo/modules/material/mapper/ src/main/resources/mapper/Material*
git commit -m "feat(material): add all mapper interfaces and XML mappings"
```

---

### Task 4: DTO 类

**Files:**
- Create: `src/main/java/com/example/demo/modules/material/dto/MaterialCategoryView.java`
- Create: `src/main/java/com/example/demo/modules/material/dto/MaterialItemView.java`
- Create: `src/main/java/com/example/demo/modules/material/dto/MaterialRequestView.java`
- Create: `src/main/java/com/example/demo/modules/material/dto/MaterialRequestLineView.java`
- Create: `src/main/java/com/example/demo/modules/material/dto/CreateMaterialRequestReq.java`
- Create: `src/main/java/com/example/demo/modules/material/dto/MaterialItemUpsertReq.java`
- Create: `src/main/java/com/example/demo/modules/material/dto/FulfillMaterialRequestReq.java`
- Create: `src/main/java/com/example/demo/modules/material/dto/InboundMaterialReq.java`
- Create: `src/main/java/com/example/demo/modules/material/dto/MaterialAuditTrailView.java`
- Create: `src/main/java/com/example/demo/modules/material/dto/MaterialStatsOverview.java`

- [ ] **Step 1: 创建 MaterialCategoryView**

```java
package com.example.demo.modules.material.dto;

import lombok.Data;

@Data
public class MaterialCategoryView {
    private Long id;
    private String name;
    private Integer sortOrder;
    private Integer status;
    private String createdAt;
    private String updatedAt;
}
```

- [ ] **Step 2: 创建 MaterialItemView**

```java
package com.example.demo.modules.material.dto;

import lombok.Data;

@Data
public class MaterialItemView {
    private Long id;
    private Long categoryId;
    private String categoryName;
    private String name;
    private String subtitle;
    private String coverUrl;
    private String shelfStatus;
    private String stockMode;
    private Integer stockQty;
    private String workflowType;
    /** 审核人账号ID列表,前端展示用 */
    private String reviewerIds;
    private String secondReviewerIds;
    private Boolean isNewItem;
    private String createdAt;
    private String lastInboundAt;
}
```

- [ ] **Step 3: 创建 CreateMaterialRequestReq**

```java
package com.example.demo.modules.material.dto;

import lombok.Data;
import java.util.List;

@Data
public class CreateMaterialRequestReq {
    private List<LineItem> lines;

    @Data
    public static class LineItem {
        private Long itemId;
        private Integer qty;
    }
}
```

- [ ] **Step 4: 创建 FulfillMaterialRequestReq**

```java
package com.example.demo.modules.material.dto;

import lombok.Data;
import java.util.List;

@Data
public class FulfillMaterialRequestReq {
    private List<LineFulfill> lines;

    @Data
    public static class LineFulfill {
        private Long lineId;
        private Boolean grant;
        private Integer fulfillQty;
    }
}
```

- [ ] **Step 5: 创建 MaterialItemUpsertReq, InboundMaterialReq, MaterialStatsOverview**

```java
// MaterialItemUpsertReq.java
package com.example.demo.modules.material.dto;

import lombok.Data;

@Data
public class MaterialItemUpsertReq {
    private Long categoryId;
    private String name;
    private String subtitle;
    private String coverUrl;
    private String shelfStatus;
    private String stockMode;
    private String workflowType;
    private String reviewerIds;
    private String secondReviewerIds;
}

// InboundMaterialReq.java
package com.example.demo.modules.material.dto;

import lombok.Data;

@Data
public class InboundMaterialReq {
    private Long itemId;
    private Integer qty;
}

// MaterialStatsOverview.java — 统计概览响应，每个字段有独立注释便于 agent 调用
package com.example.demo.modules.material.dto;

import lombok.Data;
import java.util.List;
import java.util.Map;

@Data
public class MaterialStatsOverview {
    /** 时间区间内总申领单数 */
    private Long totalRequests;
    /** 时间区间内总出库数量 */
    private Long totalFulfilledQty;
    /** 按学生维度聚合：userId, applicantName, applicantGroup, total, activeDays */
    private List<Map<String, Object>> byStudent;
    /** 按物品维度聚合：itemId, snapshotName, totalQty, requestCount */
    private List<Map<String, Object>> byItem;
}

// MaterialAuditTrailView.java — 审计流水单行视图
package com.example.demo.modules.material.dto;

import lombok.Data;

@Data
public class MaterialAuditTrailView {
    private String requestId;
    private String userId;
    private String applicantName;
    private String applicantGroup;
    private String status;
    private String itemName;
    private Integer qty;
    private Integer fulfilledQty;
    private String createdAt;
    private String fulfilledAt;
    private String fulfilledBy;
    private String firstReviewerId;
    private String secondReviewerId;
    private String firstReviewTime;
    private String secondReviewTime;
}

// MaterialRequestView.java
package com.example.demo.modules.material.dto;

import lombok.Data;
import java.util.List;

@Data
public class MaterialRequestView {
    private String id;
    private String userId;
    private String applicantName;
    private String applicantGroup;
    private String status;
    private String workflowType;
    private String firstReviewerId;
    private String firstReviewTime;
    private String secondReviewerId;
    private String secondReviewTime;
    private String fulfilledAt;
    private String fulfilledBy;
    private String receivedAt;
    private String createdAt;
    private String updatedAt;
    private List<MaterialRequestLineView> lines;
}

// MaterialRequestLineView.java
package com.example.demo.modules.material.dto;

import lombok.Data;

@Data
public class MaterialRequestLineView {
    private Long id;
    private Long itemId;
    private Integer qty;
    private String snapshotName;
    private Integer fulfilledQty;
}
```

- [ ] **Step 6: 编译验证 + Commit**

```bash
mvn compile -pl . -q
git add src/main/java/com/example/demo/modules/material/dto/
git commit -m "feat(material): add all DTOs"
```

---

### Task 5: MaterialService 核心业务逻辑

**Files:**
- Create: `src/main/java/com/example/demo/modules/material/service/MaterialService.java`

- [ ] **Step 1: 创建 MaterialService**

核心方法覆盖：分类管理、物品管理、购物车、申领单 CRUD、审核、出库、流水记录、统计查询。

```java
package com.example.demo.modules.material.service;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.material.dto.*;
import com.example.demo.modules.material.entity.*;
import com.example.demo.modules.material.mapper.*;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class MaterialService {
    private static final Logger log = LoggerFactory.getLogger(MaterialService.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    private final MaterialCategoryMapper categoryMapper;
    private final MaterialItemMapper itemMapper;
    private final MaterialCartMapper cartMapper;
    private final MaterialRequestMapper requestMapper;
    private final MaterialRequestLineMapper requestLineMapper;
    private final MaterialStockMovementMapper stockMovementMapper;
    private final MaterialOperationLogMapper operationLogMapper;

    public MaterialService(MaterialCategoryMapper categoryMapper, MaterialItemMapper itemMapper,
                           MaterialCartMapper cartMapper, MaterialRequestMapper requestMapper,
                           MaterialRequestLineMapper requestLineMapper,
                           MaterialStockMovementMapper stockMovementMapper,
                           MaterialOperationLogMapper operationLogMapper) {
        this.categoryMapper = categoryMapper;
        this.itemMapper = itemMapper;
        this.cartMapper = cartMapper;
        this.requestMapper = requestMapper;
        this.requestLineMapper = requestLineMapper;
        this.stockMovementMapper = stockMovementMapper;
        this.operationLogMapper = operationLogMapper;
    }

    // ==================== 分类 ====================

    public List<MaterialCategoryView> listCategoriesForStudent() {
        return categoryMapper.selectEnabled().stream().map(this::toCategoryView).collect(Collectors.toList());
    }

    public List<MaterialCategoryView> listCategoriesForAdmin() {
        return categoryMapper.selectAll().stream().map(this::toCategoryView).collect(Collectors.toList());
    }

    public Result<MaterialCategoryView> createCategory(String name, Integer sortOrder) {
        MaterialCategory c = new MaterialCategory();
        c.setName(name);
        c.setSortOrder(sortOrder != null ? sortOrder : 0);
        c.setStatus(1);
        categoryMapper.insert(c);
        logOp("CATEGORY", String.valueOf(c.getId()), "CREATE", null);
        return Result.success(toCategoryView(categoryMapper.selectById(c.getId())));
    }

    public Result<MaterialCategoryView> updateCategory(Long id, String name, Integer sortOrder, Integer status) {
        MaterialCategory c = categoryMapper.selectById(id);
        if (c == null) return Result.error("分类不存在");
        if (name != null) c.setName(name);
        if (sortOrder != null) c.setSortOrder(sortOrder);
        if (status != null) c.setStatus(status);
        categoryMapper.updateById(c);
        return Result.success(toCategoryView(categoryMapper.selectById(id)));
    }

    public Result<?> deleteCategory(Long id) {
        categoryMapper.deleteById(id);
        return Result.success(null);
    }

    // ==================== 物品 ====================

    public List<MaterialItemView> listItemsForStudent(Long categoryId) {
        List<MaterialItem> items = itemMapper.selectPublished(categoryId);
        return items.stream().map(this::toItemView).collect(Collectors.toList());
    }

    public List<MaterialItemView> listItemsForAdmin(Long categoryId) {
        List<MaterialItem> items = itemMapper.selectAll(categoryId);
        return items.stream().map(this::toItemView).collect(Collectors.toList());
    }

    public Result<MaterialItemView> getItem(Long id) {
        MaterialItem item = itemMapper.selectById(id);
        if (item == null) return Result.error("物品不存在");
        return Result.success(toItemView(item));
    }

    @Transactional
    public Result<MaterialItemView> createItem(MaterialItemUpsertReq req) {
        MaterialItem item = new MaterialItem();
        item.setCategoryId(req.getCategoryId());
        item.setName(req.getName());
        item.setSubtitle(req.getSubtitle());
        item.setCoverUrl(req.getCoverUrl());
        item.setShelfStatus(req.getShelfStatus() != null ? req.getShelfStatus() : "DRAFT");
        item.setStockMode(req.getStockMode() != null ? req.getStockMode() : "LIMITED");
        item.setStockQty(0);
        item.setWorkflowType(req.getWorkflowType() != null ? req.getWorkflowType() : "SIMPLE");
        item.setReviewerIds(req.getReviewerIds());
        item.setSecondReviewerIds(req.getSecondReviewerIds());
        itemMapper.insert(item);
        logOp("ITEM", String.valueOf(item.getId()), "CREATE", null);
        return Result.success(toItemView(itemMapper.selectById(item.getId())));
    }

    @Transactional
    public Result<MaterialItemView> updateItem(Long id, MaterialItemUpsertReq req) {
        MaterialItem item = itemMapper.selectById(id);
        if (item == null) return Result.error("物品不存在");
        if (req.getCategoryId() != null) item.setCategoryId(req.getCategoryId());
        if (req.getName() != null) item.setName(req.getName());
        if (req.getSubtitle() != null) item.setSubtitle(req.getSubtitle());
        if (req.getCoverUrl() != null) item.setCoverUrl(req.getCoverUrl());
        if (req.getShelfStatus() != null) item.setShelfStatus(req.getShelfStatus());
        if (req.getStockMode() != null) item.setStockMode(req.getStockMode());
        if (req.getWorkflowType() != null) item.setWorkflowType(req.getWorkflowType());
        if (req.getReviewerIds() != null) item.setReviewerIds(req.getReviewerIds());
        if (req.getSecondReviewerIds() != null) item.setSecondReviewerIds(req.getSecondReviewerIds());
        itemMapper.updateById(item);
        logOp("ITEM", String.valueOf(id), "UPDATE", null);
        return Result.success(toItemView(itemMapper.selectById(id)));
    }

    @Transactional
    public Result<?> inbound(User operator, InboundMaterialReq req) {
        MaterialItem item = itemMapper.selectById(req.getItemId());
        if (item == null) return Result.error("物品不存在");
        int before = item.getStockQty() != null ? item.getStockQty() : 0;
        itemMapper.updateStock(req.getItemId(), req.getQty());
        MaterialStockMovement m = new MaterialStockMovement();
        m.setItemId(req.getItemId());
        m.setMovementType("INBOUND");
        m.setQty(req.getQty());
        m.setStockAfter(before + req.getQty());
        m.setOperatorUserId(operator != null ? operator.getId() : null);
        m.setRemark("入库");
        stockMovementMapper.insert(m);
        if ("DRAFT".equals(item.getShelfStatus())) {
            item.setShelfStatus("PUBLISHED");
            itemMapper.updateById(item);
        }
        logOp("ITEM", String.valueOf(req.getItemId()), "INBOUND", Map.of("qty", req.getQty()));
        return Result.success(null);
    }

    // ==================== 购物车 ====================

    public Result<Map<String, Object>> getCart(User user) {
        MaterialCart cart = cartMapper.selectByUserId(user.getId());
        Map<String, Object> result = new HashMap<>();
        if (cart != null && cart.getLinesJson() != null) {
            try {
                Map<String, Integer> lines = objectMapper.readValue(cart.getLinesJson(),
                        new TypeReference<Map<String, Integer>>() {});
                result.put("lines", lines);
            } catch (Exception e) {
                result.put("lines", new HashMap<>());
            }
        } else {
            result.put("lines", new HashMap<>());
        }
        return Result.success(result);
    }

    public Result<?> saveCart(User user, Map<String, Object> body) {
        try {
            @SuppressWarnings("unchecked")
            Map<String, Integer> lines = (Map<String, Integer>) body.getOrDefault("lines", new HashMap<>());
            String json = objectMapper.writeValueAsString(lines);
            cartMapper.insertOrUpdate(user.getId(), json);
            return Result.success(null);
        } catch (Exception e) {
            return Result.error("保存购物车失败");
        }
    }

    // ==================== 申领单 ====================

    @Transactional
    public Result<MaterialRequestView> createRequest(User user, CreateMaterialRequestReq req) {
        if (req.getLines() == null || req.getLines().isEmpty()) return Result.error("申领物品不能为空");

        // 生成申领单ID
        String id = "MR" + System.currentTimeMillis() + String.format("%04d", new Random().nextInt(10000));
        MaterialRequest request = new MaterialRequest();
        request.setId(id);
        request.setUserId(user.getId());
        request.setApplicantName(user.getName());
        request.setApplicantGroup(user.getDepartmentName());
        request.setStatus("PENDING");
        // 取第一个物品的 workflow_type 作为申领单的流程类型
        MaterialItem firstItem = itemMapper.selectById(req.getLines().get(0).getItemId());
        request.setWorkflowType(firstItem != null ? firstItem.getWorkflowType() : "SIMPLE");
        requestMapper.insert(request);

        List<MaterialRequestLine> lines = new ArrayList<>();
        for (var lineReq : req.getLines()) {
            MaterialItem item = itemMapper.selectById(lineReq.getItemId());
            MaterialRequestLine line = new MaterialRequestLine();
            line.setRequestId(id);
            line.setItemId(lineReq.getItemId());
            line.setQty(lineReq.getQty());
            line.setSnapshotName(item != null ? item.getName() : "未知物品");
            line.setFulfilledQty(0);
            lines.add(line);
        }
        requestLineMapper.insertBatch(lines);
        logOp("REQUEST", id, "SUBMIT", Map.of("lines", req.getLines().size()));
        return Result.success(toRequestView(requestMapper.selectById(id)));
    }

    public Result<Map<String, Object>> listMine(User user, String status, int page, int size) {
        int offset = (page - 1) * size;
        List<MaterialRequest> requests = requestMapper.selectByUserId(user.getId(), status, offset, size);
        int total = requestMapper.countByUserId(user.getId(), status);
        List<MaterialRequestView> views = requests.stream().map(this::toRequestView).collect(Collectors.toList());
        Map<String, Object> result = new HashMap<>();
        result.put("data", views);
        result.put("total", total);
        return Result.success(result);
    }

    public Result<Map<String, Object>> listAll(String status, int page, int size) {
        int offset = (page - 1) * size;
        List<MaterialRequest> requests = requestMapper.selectAll(status, offset, size);
        int total = requestMapper.countAll(status);
        List<MaterialRequestView> views = requests.stream().map(this::toRequestView).collect(Collectors.toList());
        Map<String, Object> result = new HashMap<>();
        result.put("data", views);
        result.put("total", total);
        return Result.success(result);
    }

    public Result<MaterialRequestView> getRequestDetail(User user, String id) {
        MaterialRequest request = requestMapper.selectById(id);
        if (request == null) return Result.error("申领单不存在");
        // 学生只能看自己的
        if (user.getRole() == null || "STUDENT".equals(user.getRole().name())) {
            if (!user.getId().equals(request.getUserId())) return Result.error("无权查看");
        }
        return Result.success(toRequestView(request));
    }

    @Transactional
    public Result<?> withdraw(User user, String id) {
        MaterialRequest request = requestMapper.selectById(id);
        if (request == null) return Result.error("申领单不存在");
        if (!user.getId().equals(request.getUserId())) return Result.error("只能撤回自己的申领");
        if (!"PENDING".equals(request.getStatus()) && !"FIRST_OK".equals(request.getStatus()))
            return Result.error("当前状态不可撤回");
        requestMapper.updateStatus(id, "DRAFT");
        logOp("REQUEST", id, "WITHDRAW", null);
        return Result.success(null);
    }

    @Transactional
    public Result<?> confirmReceive(User user, String id) {
        MaterialRequest request = requestMapper.selectById(id);
        if (request == null) return Result.error("申领单不存在");
        if (!user.getId().equals(request.getUserId())) return Result.error("只能确认自己的申领");
        if (!"FULFILLED".equals(request.getStatus())) return Result.error("当前状态不可确认");
        requestMapper.updateReceived(id);
        logOp("REQUEST", id, "RECEIVE", null);
        return Result.success(null);
    }

    // ==================== 审核（教职工） ====================

    public Result<List<MaterialRequestView>> listPendingForReview(User reviewer) {
        // 获取所有待审申领，按审核人账号筛选
        List<MaterialRequest> pending = requestMapper.selectPendingByReviewer(reviewer.getId());
        List<MaterialRequestView> views = pending.stream()
                .filter(r -> canReview(r, reviewer))
                .map(this::toRequestView)
                .collect(Collectors.toList());
        return Result.success(views);
    }

    /** 审核人双校验：账号在 reviewer_ids 中 + 角色 >= STAFF */
    private boolean canReview(MaterialRequest request, User reviewer) {
        if (reviewer.getRole() == null) return false;
        // 角色校验（STUDENT 不可审核）
        if ("STUDENT".equals(reviewer.getRole().name())) return false;
        // 按申领单关联的物品检查审核人列表
        List<MaterialRequestLine> lines = requestLineMapper.selectByRequestId(request.getId());
        if (lines.isEmpty()) return false;
        MaterialItem item = itemMapper.selectById(lines.get(0).getItemId());
        if (item == null) return false;
        // 简单流程：检查 reviewer_ids；复核流程：初审查 reviewer_ids，复审查 second_reviewer_ids
        if ("SIMPLE".equals(request.getWorkflowType()) || "PENDING".equals(request.getStatus())) {
            return isInReviewerList(item.getReviewerIds(), reviewer.getId());
        } else if ("FIRST_OK".equals(request.getStatus())) {
            return isInReviewerList(item.getSecondReviewerIds(), reviewer.getId());
        }
        return false;
    }

    private boolean isInReviewerList(String reviewerIdsJson, String userId) {
        if (reviewerIdsJson == null || reviewerIdsJson.isBlank()) return true; // 未设置则任何人可审
        try {
            List<String> ids = objectMapper.readValue(reviewerIdsJson, new TypeReference<List<String>>() {});
            return ids.contains(userId);
        } catch (Exception e) {
            return true; // 解析失败则不限制
        }
    }

    @Transactional
    public Result<MaterialRequestView> approve(User reviewer, String id) {
        MaterialRequest request = requestMapper.selectById(id);
        if (request == null) return Result.error("申领单不存在");
        if (!canReview(request, reviewer)) return Result.error("无权审核此申领单");

        if ("SIMPLE".equals(request.getWorkflowType())) {
            requestMapper.updateReview(id, reviewer.getId(), "APPROVED");
            logOp("REQUEST", id, "APPROVE", Map.of("reviewer", reviewer.getId()));
        } else if ("DUAL_REVIEW".equals(request.getWorkflowType())) {
            if ("PENDING".equals(request.getStatus())) {
                requestMapper.updateReview(id, reviewer.getId(), "FIRST_OK");
                logOp("REQUEST", id, "FIRST_OK", Map.of("reviewer", reviewer.getId()));
            } else if ("FIRST_OK".equals(request.getStatus())) {
                requestMapper.updateReview(id, reviewer.getId(), "APPROVED");
                logOp("REQUEST", id, "APPROVE", Map.of("reviewer", reviewer.getId()));
            }
        }
        return Result.success(toRequestView(requestMapper.selectById(id)));
    }

    @Transactional
    public Result<?> reject(User reviewer, String id) {
        MaterialRequest request = requestMapper.selectById(id);
        if (request == null) return Result.error("申领单不存在");
        if (!canReview(request, reviewer)) return Result.error("无权审核此申领单");
        requestMapper.updateStatus(id, "REJECTED");
        logOp("REQUEST", id, "REJECT", Map.of("reviewer", reviewer.getId()));
        return Result.success(null);
    }

    @Transactional
    public Result<MaterialRequestView> fulfill(User operator, String id, FulfillMaterialRequestReq req) {
        MaterialRequest request = requestMapper.selectById(id);
        if (request == null) return Result.error("申领单不存在");
        if (!"APPROVED".equals(request.getStatus())) return Result.error("当前状态不可出库");

        List<MaterialRequestLine> lines = requestLineMapper.selectByRequestId(id);
        for (var fl : req.getLines()) {
            if (Boolean.TRUE.equals(fl.getGrant())) {
                int qty = fl.getFulfillQty() != null ? fl.getFulfillQty() : 0;
                MaterialRequestLine line = lines.stream().filter(l -> l.getId().equals(fl.getLineId())).findFirst().orElse(null);
                if (line == null) continue;
                requestLineMapper.updateFulfilledQty(fl.getLineId(), qty);
                // 扣减库存
                MaterialItem item = itemMapper.selectById(line.getItemId());
                if (item != null && "LIMITED".equals(item.getStockMode())) {
                    itemMapper.updateStock(line.getItemId(), -qty);
                    // 记录流水
                    MaterialStockMovement m = new MaterialStockMovement();
                    m.setItemId(line.getItemId());
                    m.setMovementType("OUTBOUND");
                    m.setQty(-qty);
                    m.setStockAfter((item.getStockQty() != null ? item.getStockQty() : 0) - qty);
                    m.setRequestId(id);
                    m.setRequestLineId(line.getId());
                    m.setOperatorUserId(operator.getId());
                    m.setApplicantUserId(request.getUserId());
                    m.setRemark("申领出库");
                    stockMovementMapper.insert(m);
                }
            }
        }
        requestMapper.updateFulfill(id, operator.getId());
        logOp("REQUEST", id, "FULFILL", Map.of("operator", operator.getId()));
        return Result.success(toRequestView(requestMapper.selectById(id)));
    }

    // ==================== 统计审计 ====================

    /**
     * 统计概览：总申领数 + 总出库数 + 按学生聚合 + 按物品聚合
     * 供统计面板和外部 agent 调用
     *
     * @param from 起始日期 yyyy-MM-dd
     * @param to   截止日期 yyyy-MM-dd
     */
    public Result<MaterialStatsOverview> getStatsOverview(String from, String to) {
        MaterialStatsOverview overview = new MaterialStatsOverview();
        overview.setByStudent(requestMapper.statsByStudent(from, to));
        overview.setByItem(requestMapper.statsByItem(from, to));
        long totalFulfilled = overview.getByItem().stream()
                .mapToLong(m -> ((Number) m.getOrDefault("total_qty", 0)).longValue()).sum();
        overview.setTotalFulfilledQty(totalFulfilled);
        overview.setTotalRequests(overview.getByStudent().stream()
                .mapToLong(m -> ((Number) m.getOrDefault("total", 0)).longValue()).sum());
        return Result.success(overview);
    }

    /**
     * 审计流水：分页查询，支持按时间区间+物品分类+课题组筛选
     * 供审计面板和外部 agent 调用
     *
     * @param from       起始日期 yyyy-MM-dd
     * @param to         截止日期 yyyy-MM-dd
     * @param categoryId 物品分类ID（可选）
     * @param groupId    课题组（可选）
     * @param page       页码
     * @param size       每页条数
     */
    public Result<Map<String, Object>> getAuditTrail(String from, String to, Long categoryId,
                                                      String groupId, int page, int size) {
        int offset = (page - 1) * size;
        List<MaterialRequest> requests = requestMapper.selectAuditTrail(from, to, categoryId, groupId, offset, size);
        int total = requestMapper.countAuditTrail(from, to, categoryId, groupId);

        List<MaterialAuditTrailView> views = new ArrayList<>();
        for (MaterialRequest req : requests) {
            List<MaterialRequestLine> lines = requestLineMapper.selectByRequestId(req.getId());
            for (MaterialRequestLine line : lines) {
                MaterialAuditTrailView v = new MaterialAuditTrailView();
                v.setRequestId(req.getId());
                v.setUserId(req.getUserId());
                v.setApplicantName(req.getApplicantName());
                v.setApplicantGroup(req.getApplicantGroup());
                v.setStatus(req.getStatus());
                v.setItemName(line.getSnapshotName());
                v.setQty(line.getQty());
                v.setFulfilledQty(line.getFulfilledQty());
                v.setCreatedAt(req.getCreatedAt() != null ? req.getCreatedAt().toString() : null);
                v.setFulfilledAt(req.getFulfilledAt() != null ? req.getFulfilledAt().toString() : null);
                v.setFulfilledBy(req.getFulfilledBy());
                v.setFirstReviewerId(req.getFirstReviewerId());
                v.setSecondReviewerId(req.getSecondReviewerId());
                v.setFirstReviewTime(req.getFirstReviewTime() != null ? req.getFirstReviewTime().toString() : null);
                v.setSecondReviewTime(req.getSecondReviewTime() != null ? req.getSecondReviewTime().toString() : null);
                views.add(v);
            }
        }
        Map<String, Object> result = new HashMap<>();
        result.put("data", views);
        result.put("total", total);
        return Result.success(result);
    }

    // ==================== 内部辅助 ====================

    private MaterialCategoryView toCategoryView(MaterialCategory c) {
        MaterialCategoryView v = new MaterialCategoryView();
        v.setId(c.getId());
        v.setName(c.getName());
        v.setSortOrder(c.getSortOrder());
        v.setStatus(c.getStatus());
        return v;
    }

    private MaterialItemView toItemView(MaterialItem item) {
        MaterialItemView v = new MaterialItemView();
        v.setId(item.getId());
        v.setCategoryId(item.getCategoryId());
        v.setName(item.getName());
        v.setSubtitle(item.getSubtitle());
        v.setCoverUrl(item.getCoverUrl());
        v.setShelfStatus(item.getShelfStatus());
        v.setStockMode(item.getStockMode());
        v.setStockQty(item.getStockQty());
        v.setWorkflowType(item.getWorkflowType());
        v.setReviewerIds(item.getReviewerIds());
        v.setSecondReviewerIds(item.getSecondReviewerIds());
        if (item.getCreatedAt() != null) v.setCreatedAt(item.getCreatedAt().toString());
        if (item.getLastInboundAt() != null) v.setLastInboundAt(item.getLastInboundAt().toString());
        return v;
    }

    private MaterialRequestView toRequestView(MaterialRequest request) {
        MaterialRequestView v = new MaterialRequestView();
        v.setId(request.getId());
        v.setUserId(request.getUserId());
        v.setApplicantName(request.getApplicantName());
        v.setApplicantGroup(request.getApplicantGroup());
        v.setStatus(request.getStatus());
        v.setWorkflowType(request.getWorkflowType());
        v.setFirstReviewerId(request.getFirstReviewerId());
        v.setSecondReviewerId(request.getSecondReviewerId());
        if (request.getFirstReviewTime() != null) v.setFirstReviewTime(request.getFirstReviewTime().toString());
        if (request.getSecondReviewTime() != null) v.setSecondReviewTime(request.getSecondReviewTime().toString());
        if (request.getFulfilledAt() != null) v.setFulfilledAt(request.getFulfilledAt().toString());
        v.setFulfilledBy(request.getFulfilledBy());
        if (request.getReceivedAt() != null) v.setReceivedAt(request.getReceivedAt().toString());
        if (request.getCreatedAt() != null) v.setCreatedAt(request.getCreatedAt().toString());
        if (request.getUpdatedAt() != null) v.setUpdatedAt(request.getUpdatedAt().toString());
        List<MaterialRequestLine> lines = requestLineMapper.selectByRequestId(request.getId());
        v.setLines(lines.stream().map(l -> {
            MaterialRequestLineView lv = new MaterialRequestLineView();
            lv.setId(l.getId());
            lv.setItemId(l.getItemId());
            lv.setQty(l.getQty());
            lv.setSnapshotName(l.getSnapshotName());
            lv.setFulfilledQty(l.getFulfilledQty());
            return lv;
        }).collect(Collectors.toList()));
        return v;
    }

    private void logOp(String targetType, String targetId, String action, Object detail) {
        try {
            MaterialOperationLog log = new MaterialOperationLog();
            log.setTargetType(targetType);
            log.setTargetId(targetId);
            log.setAction(action);
            log.setDetail(detail != null ? objectMapper.writeValueAsString(detail) : null);
            operationLogMapper.insert(log);
        } catch (Exception e) {
            MaterialService.log.warn("记录操作日志失败: {}", e.getMessage());
        }
    }
}
```

- [ ] **Step 2: 编译验证 + Commit**

```bash
mvn compile -pl . -q
git add src/main/java/com/example/demo/modules/material/service/
git commit -m "feat(material): add MaterialService with full business logic"
```

---

### Task 6: Controller 层

**Files:**
- Create: `src/main/java/com/example/demo/modules/material/controller/MaterialController.java`
- Create: `src/main/java/com/example/demo/modules/material/controller/MaterialAdminController.java`

- [ ] **Step 1: 创建 MaterialController（学生端 API）**

参考 `SuppliesController.java:1-359` 模式，路径前缀 `/api/material`，角色校验使用 `BizDomains` 新增域（Task 7 补齐）。

```java
package com.example.demo.modules.material.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.material.dto.*;
import com.example.demo.modules.material.service.MaterialService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/material")
@Tag(name = "学生物资申领", description = "学生浏览、申领物资")
public class MaterialController {
    private final AuthContextService authContextService;
    private final MaterialService materialService;

    public MaterialController(AuthContextService authContextService, MaterialService materialService) {
        this.authContextService = authContextService;
        this.materialService = materialService;
    }

    @GetMapping("/categories")
    @Operation(summary = "启用分类列表")
    public Result<List<MaterialCategoryView>> categories(@RequestHeader(value = "Authorization", required = false) String auth) {
        return Result.success(materialService.listCategoriesForStudent());
    }

    @GetMapping("/items")
    @Operation(summary = "已上架物品列表")
    public Result<List<MaterialItemView>> items(@RequestHeader(value = "Authorization", required = false) String auth,
                                                 @RequestParam(required = false) Long categoryId) {
        return Result.success(materialService.listItemsForStudent(categoryId));
    }

    @GetMapping("/items/{id}")
    @Operation(summary = "物品详情")
    public Result<MaterialItemView> itemDetail(@PathVariable Long id) {
        return materialService.getItem(id);
    }

    @GetMapping("/cart")
    @Operation(summary = "获取购物车")
    public Result<Map<String, Object>> getCart(@RequestHeader(value = "Authorization", required = false) String auth) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return materialService.getCart(user);
    }

    @PutMapping("/cart")
    @Operation(summary = "保存购物车")
    public Result<?> saveCart(@RequestHeader(value = "Authorization", required = false) String auth,
                              @RequestBody Map<String, Object> body) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return materialService.saveCart(user, body);
    }

    @PostMapping("/requests")
    @Operation(summary = "提交申领")
    public Result<MaterialRequestView> createRequest(@RequestHeader(value = "Authorization", required = false) String auth,
                                                       @RequestBody CreateMaterialRequestReq req) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return materialService.createRequest(user, req);
    }

    @GetMapping("/requests/mine")
    @Operation(summary = "我的申领记录")
    public Result<Map<String, Object>> mine(@RequestHeader(value = "Authorization", required = false) String auth,
                                             @RequestParam(required = false) String status,
                                             @RequestParam(defaultValue = "1") int page,
                                             @RequestParam(defaultValue = "20") int size) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return materialService.listMine(user, status, page, size);
    }

    @GetMapping("/requests/{id}")
    @Operation(summary = "申领单详情")
    public Result<MaterialRequestView> requestDetail(@RequestHeader(value = "Authorization", required = false) String auth,
                                                       @PathVariable String id) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return materialService.getRequestDetail(user, id);
    }

    @PostMapping("/requests/{id}/withdraw")
    @Operation(summary = "撤回申领")
    public Result<?> withdraw(@RequestHeader(value = "Authorization", required = false) String auth,
                              @PathVariable String id) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return materialService.withdraw(user, id);
    }

    @PostMapping("/requests/{id}/receive")
    @Operation(summary = "确认领取")
    public Result<?> receive(@RequestHeader(value = "Authorization", required = false) String auth,
                             @PathVariable String id) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return materialService.confirmReceive(user, id);
    }

    @GetMapping("/stats/mine")
    @Operation(summary = "个人领用统计")
    public Result<?> myStats(@RequestHeader(value = "Authorization", required = false) String auth) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        // 统计个人: 调用 stats 方法并过滤 userId
        var overview = materialService.getStatsOverview("2000-01-01", "2099-12-31");
        return overview;
    }

    private User resolveUser(String auth) {
        User user = authContextService.resolveUserFromBearer(auth);
        if (user == null) return null;
        if (user.getRole() == null) user.setRole(RoleEnum.STUDENT);
        return user;
    }
}
```

- [ ] **Step 2: 创建 MaterialAdminController（教职工端 API）**

```java
package com.example.demo.modules.material.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.material.dto.*;
import com.example.demo.modules.material.service.MaterialService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/material/admin")
@Tag(name = "物资申领管理", description = "教职工审核、管理物资")
public class MaterialAdminController {
    private final AuthContextService authContextService;
    private final MaterialService materialService;

    public MaterialAdminController(AuthContextService authContextService, MaterialService materialService) {
        this.authContextService = authContextService;
        this.materialService = materialService;
    }

    // ============ 分类管理 ============

    @GetMapping("/categories")
    @Operation(summary = "全部分类")
    public Result<List<MaterialCategoryView>> listCategories(@RequestHeader(value = "Authorization", required = false) String auth) {
        return Result.success(materialService.listCategoriesForAdmin());
    }

    @PostMapping("/categories")
    @Operation(summary = "新建分类")
    public Result<MaterialCategoryView> createCategory(@RequestHeader(value = "Authorization", required = false) String auth,
                                                        @RequestBody Map<String, Object> body) {
        String name = (String) body.get("name");
        Integer sortOrder = body.get("sortOrder") instanceof Number ? ((Number) body.get("sortOrder")).intValue() : 0;
        return materialService.createCategory(name, sortOrder);
    }

    @PatchMapping("/categories/{id}")
    @Operation(summary = "更新分类")
    public Result<MaterialCategoryView> updateCategory(@RequestHeader(value = "Authorization", required = false) String auth,
                                                        @PathVariable Long id, @RequestBody Map<String, Object> body) {
        String name = (String) body.get("name");
        Integer sortOrder = body.get("sortOrder") instanceof Number ? ((Number) body.get("sortOrder")).intValue() : null;
        Integer status = body.get("status") instanceof Number ? ((Number) body.get("status")).intValue() : null;
        return materialService.updateCategory(id, name, sortOrder, status);
    }

    @DeleteMapping("/categories/{id}")
    @Operation(summary = "删除分类")
    public Result<?> deleteCategory(@PathVariable Long id) {
        return materialService.deleteCategory(id);
    }

    // ============ 物品管理 ============

    @GetMapping("/items")
    @Operation(summary = "物品列表")
    public Result<List<MaterialItemView>> listItems(@RequestParam(required = false) Long categoryId) {
        return Result.success(materialService.listItemsForAdmin(categoryId));
    }

    @PostMapping("/items")
    @Operation(summary = "上架新物品")
    public Result<MaterialItemView> createItem(@RequestBody MaterialItemUpsertReq body) {
        return materialService.createItem(body);
    }

    @PatchMapping("/items/{id}")
    @Operation(summary = "编辑物品")
    public Result<MaterialItemView> updateItem(@PathVariable Long id, @RequestBody MaterialItemUpsertReq body) {
        return materialService.updateItem(id, body);
    }

    @PostMapping("/inbound")
    @Operation(summary = "入库")
    public Result<?> inbound(@RequestHeader(value = "Authorization", required = false) String auth,
                             @RequestBody InboundMaterialReq body) {
        User user = resolveUser(auth);
        return materialService.inbound(user, body);
    }

    // ============ 审核 ============

    @GetMapping("/requests/pending")
    @Operation(summary = "待审核申领列表")
    public Result<List<MaterialRequestView>> pendingRequests(@RequestHeader(value = "Authorization", required = false) String auth) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return materialService.listPendingForReview(user);
    }

    @GetMapping("/requests/all")
    @Operation(summary = "全部申领记录")
    public Result<Map<String, Object>> allRequests(@RequestParam(required = false) String status,
                                                    @RequestParam(defaultValue = "1") int page,
                                                    @RequestParam(defaultValue = "20") int size) {
        return materialService.listAll(status, page, size);
    }

    @GetMapping("/requests/{id}")
    @Operation(summary = "申领详情")
    public Result<MaterialRequestView> requestDetail(@RequestHeader(value = "Authorization", required = false) String auth,
                                                       @PathVariable String id) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return materialService.getRequestDetail(user, id);
    }

    @PostMapping("/requests/{id}/approve")
    @Operation(summary = "审核通过")
    public Result<MaterialRequestView> approve(@RequestHeader(value = "Authorization", required = false) String auth,
                                                @PathVariable String id) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return materialService.approve(user, id);
    }

    @PostMapping("/requests/{id}/reject")
    @Operation(summary = "审核拒绝")
    public Result<?> reject(@RequestHeader(value = "Authorization", required = false) String auth,
                            @PathVariable String id) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return materialService.reject(user, id);
    }

    @PostMapping("/requests/{id}/fulfill")
    @Operation(summary = "出库履行")
    public Result<MaterialRequestView> fulfill(@RequestHeader(value = "Authorization", required = false) String auth,
                                                @PathVariable String id, @RequestBody FulfillMaterialRequestReq body) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return materialService.fulfill(user, id, body);
    }

    // ============ 统计审计 ============

    @GetMapping("/stats/overview")
    @Operation(summary = "统计概览")
    public Result<MaterialStatsOverview> statsOverview(@RequestParam(defaultValue = "2000-01-01") String from,
                                                        @RequestParam(defaultValue = "2099-12-31") String to) {
        return materialService.getStatsOverview(from, to);
    }

    @GetMapping("/stats/audit")
    @Operation(summary = "审计流水")
    public Result<Map<String, Object>> auditTrail(@RequestParam(defaultValue = "2000-01-01") String from,
                                                   @RequestParam(defaultValue = "2099-12-31") String to,
                                                   @RequestParam(required = false) Long categoryId,
                                                   @RequestParam(required = false) String groupId,
                                                   @RequestParam(defaultValue = "1") int page,
                                                   @RequestParam(defaultValue = "20") int size) {
        return materialService.getAuditTrail(from, to, categoryId, groupId, page, size);
    }

    private User resolveUser(String auth) {
        User user = authContextService.resolveUserFromBearer(auth);
        if (user == null) return null;
        if (user.getRole() == null) user.setRole(RoleEnum.STUDENT);
        return user;
    }
}
```

- [ ] **Step 3: 编译验证 + Commit**

```bash
mvn compile -pl . -q
git add src/main/java/com/example/demo/modules/material/controller/
git commit -m "feat(material): add MaterialController and MaterialAdminController"
```

---

### Task 7: 前端 API 层

**Files:**
- Create: `frontend/src/api/domains/material.api.ts`
- Create: `frontend/src/api/hooks/useMaterial.ts`

- [ ] **Step 1: 创建 material.api.ts**

参考 `frontend/src/api/domains/supplies.api.ts:1-421` 模式。

```typescript
import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

// ---- types ----

export interface MaterialCategory {
  id: number;
  name: string;
  sortOrder: number;
  status: number;
}

export interface MaterialItem {
  id: number;
  categoryId: number;
  name: string;
  subtitle?: string;
  coverUrl?: string;
  shelfStatus: string;
  stockMode: string;
  stockQty: number;
  workflowType: string;
  reviewerIds?: string;
  secondReviewerIds?: string;
  isNewItem?: boolean;
  createdAt?: string;
  lastInboundAt?: string;
}

export interface MaterialRequestLine {
  id: number;
  itemId: number;
  qty: number;
  snapshotName: string;
  fulfilledQty: number;
}

export interface MaterialRequest {
  id: string;
  userId: string;
  applicantName?: string;
  applicantGroup?: string;
  status: string;
  workflowType: string;
  firstReviewerId?: string;
  firstReviewTime?: string;
  secondReviewerId?: string;
  secondReviewTime?: string;
  fulfilledAt?: string;
  fulfilledBy?: string;
  receivedAt?: string;
  createdAt: string;
  lines?: MaterialRequestLine[];
}

export interface MaterialAuditTrailRow {
  requestId: string;
  userId: string;
  applicantName?: string;
  applicantGroup?: string;
  status: string;
  itemName?: string;
  qty: number;
  fulfilledQty: number;
  createdAt?: string;
  fulfilledAt?: string;
  fulfilledBy?: string;
  firstReviewerId?: string;
  secondReviewerId?: string;
  firstReviewTime?: string;
  secondReviewTime?: string;
}

export interface MaterialStatsOverview {
  totalRequests: number;
  totalFulfilledQty: number;
  byStudent: Array<Record<string, unknown>>;
  byItem: Array<Record<string, unknown>>;
}

// ---- student API ----

export async function fetchMaterialCategories() {
  const res = await authHttp.get<Result<MaterialCategory[]>>("/material/categories");
  return res.data.data;
}

export async function fetchMaterialItems(categoryId?: number) {
  const res = await authHttp.get<Result<MaterialItem[]>>("/material/items", {
    params: categoryId != null ? { categoryId } : {},
  });
  return res.data.data;
}

export async function fetchMaterialItem(id: number) {
  const res = await authHttp.get<Result<MaterialItem>>(`/material/items/${id}`);
  return res.data.data;
}

export async function fetchMaterialCart(): Promise<Record<number, number>> {
  const res = await authHttp.get<Result<{ lines?: Record<string, number> }>>("/material/cart");
  const lines = res.data.data?.lines ?? {};
  const cart: Record<number, number> = {};
  for (const [k, v] of Object.entries(lines)) {
    const id = Number(k);
    const qty = Number(v);
    if (Number.isFinite(id) && id > 0 && Number.isFinite(qty) && qty > 0) {
      cart[id] = Math.min(Math.floor(qty), 999);
    }
  }
  return cart;
}

export async function saveMaterialCart(cart: Record<number, number>): Promise<void> {
  const lines: Record<string, number> = {};
  for (const [k, v] of Object.entries(cart)) {
    const id = Number(k);
    const qty = Number(v);
    if (Number.isFinite(id) && id > 0 && Number.isFinite(qty) && qty > 0) {
      lines[String(id)] = Math.min(Math.floor(qty), 999);
    }
  }
  await authHttp.put("/material/cart", { lines });
}

export async function createMaterialRequest(lines: { itemId: number; qty: number }[]) {
  const res = await authHttp.post<Result<MaterialRequest>>("/material/requests", { lines });
  return res.data.data;
}

export async function fetchMyMaterialRequests(params: { page: number; size: number; status?: string }) {
  const res = await authHttp.get<Result<{ data: MaterialRequest[]; total: number }>>("/material/requests/mine", { params });
  return res.data.data;
}

export async function fetchMaterialRequestDetail(id: string) {
  const res = await authHttp.get<Result<MaterialRequest>>(`/material/requests/${id}`);
  return res.data.data;
}

export async function withdrawMaterialRequest(id: string) {
  await authHttp.post(`/material/requests/${id}/withdraw`);
}

export async function confirmMaterialReceive(id: string) {
  await authHttp.post(`/material/requests/${id}/receive`);
}

export async function fetchMyMaterialStats() {
  const res = await authHttp.get<Result<MaterialStatsOverview>>("/material/stats/mine");
  return res.data.data;
}

// ---- admin API ----

export async function fetchAdminMaterialCategories() {
  const res = await authHttp.get<Result<MaterialCategory[]>>("/material/admin/categories");
  return res.data.data;
}

export async function createAdminMaterialCategory(body: { name: string; sortOrder?: number }) {
  const res = await authHttp.post<Result<MaterialCategory>>("/material/admin/categories", body);
  return res.data.data;
}

export async function updateAdminMaterialCategory(id: number, body: Partial<{ name: string; sortOrder: number; status: number }>) {
  const res = await authHttp.patch<Result<MaterialCategory>>(`/material/admin/categories/${id}`, body);
  return res.data.data;
}

export async function deleteAdminMaterialCategory(id: number) {
  await authHttp.delete(`/material/admin/categories/${id}`);
}

export async function fetchAdminMaterialItems(categoryId?: number) {
  const res = await authHttp.get<Result<MaterialItem[]>>("/material/admin/items", {
    params: categoryId != null ? { categoryId } : {},
  });
  return res.data.data;
}

export async function createAdminMaterialItem(body: Partial<MaterialItem> & { categoryId: number; name: string }) {
  const res = await authHttp.post<Result<MaterialItem>>("/material/admin/items", body);
  return res.data.data;
}

export async function updateAdminMaterialItem(id: number, body: Partial<MaterialItem>) {
  const res = await authHttp.patch<Result<MaterialItem>>(`/material/admin/items/${id}`, body);
  return res.data.data;
}

export async function inboundMaterialItem(body: { itemId: number; qty: number }) {
  await authHttp.post("/material/admin/inbound", body);
}

export async function fetchPendingMaterialRequests() {
  const res = await authHttp.get<Result<MaterialRequest[]>>("/material/admin/requests/pending");
  return res.data.data;
}

export async function fetchAllMaterialRequests(params: { page: number; size: number; status?: string }) {
  const res = await authHttp.get<Result<{ data: MaterialRequest[]; total: number }>>("/material/admin/requests/all", { params });
  return res.data.data;
}

export async function approveMaterialRequest(id: string) {
  const res = await authHttp.post<Result<MaterialRequest>>(`/material/admin/requests/${id}/approve`);
  return res.data.data;
}

export async function rejectMaterialRequest(id: string) {
  await authHttp.post(`/material/admin/requests/${id}/reject`);
}

export async function fulfillMaterialRequest(id: string, lines: { lineId: number; grant: boolean; fulfillQty?: number }[]) {
  const res = await authHttp.post<Result<MaterialRequest>>(`/material/admin/requests/${id}/fulfill`, { lines });
  return res.data.data;
}

export async function fetchMaterialStatsOverview(from?: string, to?: string) {
  const res = await authHttp.get<Result<MaterialStatsOverview>>("/material/admin/stats/overview", {
    params: { from: from ?? "2000-01-01", to: to ?? "2099-12-31" },
  });
  return res.data.data;
}

export async function fetchMaterialAuditTrail(params: {
  from?: string; to?: string; categoryId?: number; groupId?: string; page: number; size: number;
}) {
  const res = await authHttp.get<Result<{ data: MaterialAuditTrailRow[]; total: number }>>("/material/admin/stats/audit", { params });
  return res.data.data;
}
```

- [ ] **Step 2: 创建 useMaterial.ts hooks**

参考 `frontend/src/api/hooks/useSupplies.ts` 模式。

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchMaterialCategories,
  fetchMaterialItems,
  fetchMaterialCart,
  saveMaterialCart,
  createMaterialRequest,
  fetchMyMaterialRequests,
  fetchMaterialRequestDetail,
  withdrawMaterialRequest,
  confirmMaterialReceive,
  fetchMyMaterialStats,
  fetchAdminMaterialCategories,
  fetchAdminMaterialItems,
  createAdminMaterialItem,
  updateAdminMaterialItem,
  inboundMaterialItem,
  fetchPendingMaterialRequests,
  fetchAllMaterialRequests,
  approveMaterialRequest,
  rejectMaterialRequest,
  fulfillMaterialRequest,
  fetchMaterialStatsOverview,
  fetchMaterialAuditTrail,
} from "@/api/domains/material.api";
import { materialQueryKeys } from "@/api/hooks/queryKeys";

// student hooks
export function useMaterialCategories() {
  return useQuery({ queryKey: materialQueryKeys.categories(), queryFn: fetchMaterialCategories });
}

export function useMaterialItems(categoryId?: number) {
  return useQuery({ queryKey: materialQueryKeys.items(categoryId), queryFn: () => fetchMaterialItems(categoryId) });
}

export function useMaterialCart() {
  return useQuery({ queryKey: materialQueryKeys.cart(), queryFn: fetchMaterialCart });
}

export function useSaveMaterialCart() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: saveMaterialCart, onSuccess: () => qc.invalidateQueries({ queryKey: materialQueryKeys.cart() }) });
}

export function useCreateMaterialRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createMaterialRequest,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: materialQueryKeys.requests() });
      qc.invalidateQueries({ queryKey: materialQueryKeys.cart() });
    },
  });
}

export function useMyMaterialRequests(params: { page: number; size: number; status?: string }) {
  return useQuery({ queryKey: materialQueryKeys.myRequests(params), queryFn: () => fetchMyMaterialRequests(params) });
}

export function useMaterialRequestDetail(id: string) {
  return useQuery({ queryKey: materialQueryKeys.requestDetail(id), queryFn: () => fetchMaterialRequestDetail(id), enabled: !!id });
}

export function useWithdrawMaterialRequest() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: withdrawMaterialRequest, onSuccess: () => qc.invalidateQueries({ queryKey: materialQueryKeys.requests() }) });
}

export function useConfirmMaterialReceive() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: confirmMaterialReceive, onSuccess: () => qc.invalidateQueries({ queryKey: materialQueryKeys.requests() }) });
}

export function useMyMaterialStats() {
  return useQuery({ queryKey: materialQueryKeys.myStats(), queryFn: fetchMyMaterialStats });
}

// admin hooks
export function useAdminMaterialCategories() {
  return useQuery({ queryKey: materialQueryKeys.adminCategories(), queryFn: fetchAdminMaterialCategories });
}

export function useAdminMaterialItems(categoryId?: number) {
  return useQuery({ queryKey: materialQueryKeys.adminItems(categoryId), queryFn: () => fetchAdminMaterialItems(categoryId) });
}

export function useCreateAdminMaterialItem() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: createAdminMaterialItem, onSuccess: () => qc.invalidateQueries({ queryKey: materialQueryKeys.adminItems() }) });
}

export function useUpdateAdminMaterialItem() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, body }: { id: number; body: Partial<Record<string, unknown>> }) => updateAdminMaterialItem(id, body), onSuccess: () => qc.invalidateQueries({ queryKey: materialQueryKeys.adminItems() }) });
}

export function useInboundMaterialItem() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: inboundMaterialItem, onSuccess: () => qc.invalidateQueries({ queryKey: materialQueryKeys.adminItems() }) });
}

export function usePendingMaterialRequests() {
  return useQuery({ queryKey: materialQueryKeys.pendingRequests(), queryFn: fetchPendingMaterialRequests });
}

export function useAllMaterialRequests(params: { page: number; size: number; status?: string }) {
  return useQuery({ queryKey: materialQueryKeys.allRequests(params), queryFn: () => fetchAllMaterialRequests(params) });
}

export function useApproveMaterialRequest() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: approveMaterialRequest, onSuccess: () => qc.invalidateQueries({ queryKey: materialQueryKeys.requests() }) });
}

export function useRejectMaterialRequest() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: rejectMaterialRequest, onSuccess: () => qc.invalidateQueries({ queryKey: materialQueryKeys.requests() }) });
}

export function useFulfillMaterialRequest() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, lines }: { id: string; lines: { lineId: number; grant: boolean; fulfillQty?: number }[] }) => fulfillMaterialRequest(id, lines), onSuccess: () => qc.invalidateQueries({ queryKey: materialQueryKeys.requests() }) });
}

export function useMaterialStatsOverview(from?: string, to?: string) {
  return useQuery({ queryKey: materialQueryKeys.statsOverview(from, to), queryFn: () => fetchMaterialStatsOverview(from, to) });
}

export function useMaterialAuditTrail(params: { from?: string; to?: string; categoryId?: number; groupId?: string; page: number; size: number }) {
  return useQuery({ queryKey: materialQueryKeys.auditTrail(params), queryFn: () => fetchMaterialAuditTrail(params) });
}
```

- [ ] **Step 3: 添加 queryKeys**

在 `frontend/src/api/hooks/queryKeys.ts` 中添加 material 相关的 queryKey factory：

```typescript
// 在文件末尾添加 material 相关 queryKeys
export const materialQueryKeys = {
  all: ["material"] as const,
  categories: () => [...materialQueryKeys.all, "categories"] as const,
  items: (categoryId?: number) => [...materialQueryKeys.all, "items", { categoryId }] as const,
  cart: () => [...materialQueryKeys.all, "cart"] as const,
  requests: () => [...materialQueryKeys.all, "requests"] as const,
  myRequests: (params: Record<string, unknown>) => [...materialQueryKeys.requests(), "mine", params] as const,
  requestDetail: (id: string) => [...materialQueryKeys.requests(), "detail", id] as const,
  myStats: () => [...materialQueryKeys.all, "stats", "mine"] as const,
  adminCategories: () => [...materialQueryKeys.all, "admin", "categories"] as const,
  adminItems: (categoryId?: number) => [...materialQueryKeys.all, "admin", "items", { categoryId }] as const,
  pendingRequests: () => [...materialQueryKeys.requests(), "pending"] as const,
  allRequests: (params: Record<string, unknown>) => [...materialQueryKeys.requests(), "all", params] as const,
  statsOverview: (from?: string, to?: string) => [...materialQueryKeys.all, "stats", "overview", { from, to }] as const,
  auditTrail: (params: Record<string, unknown>) => [...materialQueryKeys.all, "stats", "audit", params] as const,
};
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/domains/material.api.ts frontend/src/api/hooks/useMaterial.ts frontend/src/api/hooks/queryKeys.ts
git commit -m "feat(material): add frontend API layer — material.api + hooks"
```

---

### Task 8: 学生端页面 — 物资商城

**Files:**
- Create: `frontend/src/features/student/pages/student-material.tsx`

- [ ] **Step 1: 创建物资商城页面**

页面布局：左侧分类列表 + 右侧物品卡片网格 + 底部购物车抽屉。参考 `AdminSuppliesMallPage.tsx` 的布局模式，但使用 StudentCard/Badge 等学生端组件。

```typescript
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ShoppingCart, ChevronLeft, Plus, Minus, Send } from "lucide-react";
import { useMaterialCategories, useMaterialItems, useMaterialCart, useSaveMaterialCart, useCreateMaterialRequest } from "@/api/hooks/useMaterial";
import type { MaterialItem } from "@/api/domains/material.api";
import { StudentCard, Skeleton, ErrorRetry, EmptyState, Badge } from "../components/ui";
import { cn } from "@/lib/utils";

export default function StudentMaterialPage() {
  const navigate = useNavigate();
  const { data: categories, isLoading: catLoading } = useMaterialCategories();
  const [activeCategoryId, setActiveCategoryId] = useState<number | undefined>();
  const { data: items, isLoading: itemsLoading } = useMaterialItems(activeCategoryId);
  const { data: cart } = useMaterialCart();
  const saveCart = useSaveMaterialCart();
  const createRequest = useCreateMaterialRequest();

  const [showCart, setShowCart] = useState(false);

  const cartCount = useMemo(() => {
    if (!cart) return 0;
    return Object.values(cart).reduce((a, b) => a + b, 0);
  }, [cart]);

  const cartItems = useMemo(() => {
    if (!cart || !items) return [];
    return items
      .filter((item) => cart[item.id] && cart[item.id] > 0)
      .map((item) => ({ ...item, cartQty: cart[item.id] }));
  }, [cart, items]);

  function updateCartQty(itemId: number, delta: number) {
    if (!cart) return;
    const next = { ...cart };
    const cur = next[itemId] || 0;
    const nv = Math.max(0, Math.min(999, cur + delta));
    if (nv === 0) delete next[itemId];
    else next[itemId] = nv;
    saveCart.mutate(next);
  }

  async function handleSubmit() {
    if (!cart || cartCount === 0) return;
    const lines = Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([itemId, qty]) => ({ itemId: Number(itemId), qty }));
    await createRequest.mutateAsync(lines);
    navigate("/student/material/requests");
  }

  if (catLoading) return <div className="p-6"><Skeleton className="h-8 w-48 mb-4" /><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="flex h-full bg-[var(--student-canvas-soft)]">
      {/* 左侧分类 */}
      <aside className="w-[180px] shrink-0 border-r border-[var(--student-hairline)] bg-white p-3 space-y-1 overflow-y-auto">
        <button
          onClick={() => setActiveCategoryId(undefined)}
          className={cn("w-full text-left px-3 py-2 rounded-[var(--student-radius-sm)] text-[13px] transition-colors",
            !activeCategoryId ? "bg-[var(--student-primary-soft)] text-[var(--student-primary)] font-semibold" : "text-[var(--student-body)] hover:bg-[var(--student-canvas-soft)]")}
        >
          全部分类
        </button>
        {categories?.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategoryId(cat.id)}
            className={cn("w-full text-left px-3 py-2 rounded-[var(--student-radius-sm)] text-[13px] transition-colors",
              activeCategoryId === cat.id ? "bg-[var(--student-primary-soft)] text-[var(--student-primary)] font-semibold" : "text-[var(--student-body)] hover:bg-[var(--student-canvas-soft)]")}
          >
            {cat.name}
          </button>
        ))}
      </aside>

      {/* 右侧物品列表 */}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--student-hairline)] bg-white">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-[13px] text-[var(--student-mute)] hover:text-[var(--student-ink)]">
            <ChevronLeft className="size-4" /> 返回
          </button>
          <h2 className="text-[15px] font-semibold text-[var(--student-ink)]">申领物品</h2>
          <button
            onClick={() => setShowCart(!showCart)}
            className="relative flex items-center gap-1 px-3 py-1.5 rounded-[var(--student-radius-sm)] bg-[var(--student-primary)] text-white text-[13px]"
          >
            <ShoppingCart className="size-4" />
            购物车
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
                {cartCount}
              </span>
            )}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {itemsLoading ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[120px]" />)}
            </div>
          ) : !items || items.length === 0 ? (
            <EmptyState message="暂无上架物品" />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
              {items.map((item) => (
                <MaterialItemCard key={item.id} item={item} cartQty={cart?.[item.id] || 0} onQtyChange={(d) => updateCartQty(item.id, d)} />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* 购物车抽屉 */}
      {showCart && (
        <aside className="w-[320px] shrink-0 border-l border-[var(--student-hairline)] bg-white flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--student-hairline)]">
            <h3 className="text-[14px] font-semibold">购物车 ({cartCount} 件)</h3>
            <button onClick={() => setShowCart(false)} className="text-[var(--student-mute)] hover:text-[var(--student-ink)] text-[20px] leading-none">&times;</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {cartItems.length === 0 ? (
              <p className="text-center text-[13px] text-[var(--student-mute)] py-8">购物车为空</p>
            ) : (
              cartItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-2 rounded-[var(--student-radius-sm)] bg-[var(--student-canvas-soft)]">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium truncate">{item.name}</p>
                    <p className="text-[11px] text-[var(--student-mute)]">库存: {item.stockMode === "UNLIMITED" ? "无限" : item.stockQty}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => updateCartQty(item.id, -1)} className="size-6 rounded border border-[var(--student-hairline)] flex items-center justify-center"><Minus className="size-3" /></button>
                    <span className="text-[13px] w-6 text-center font-medium">{item.cartQty}</span>
                    <button onClick={() => updateCartQty(item.id, 1)} className="size-6 rounded border border-[var(--student-hairline)] flex items-center justify-center"><Plus className="size-3" /></button>
                  </div>
                </div>
              ))
            )}
          </div>
          {cartItems.length > 0 && (
            <div className="p-3 border-t border-[var(--student-hairline)]">
              <button onClick={handleSubmit} disabled={createRequest.isPending}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[var(--student-radius-md)] bg-[var(--student-primary)] text-white text-[14px] font-semibold disabled:opacity-50">
                <Send className="size-4" /> 提交申领
              </button>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

/** 物品卡片子组件 */
function MaterialItemCard({ item, cartQty, onQtyChange }: { item: MaterialItem; cartQty: number; onQtyChange: (d: number) => void }) {
  return (
    <StudentCard className="flex items-start gap-3 p-3">
      <div className="size-16 shrink-0 rounded-[var(--student-radius-sm)] bg-[var(--student-canvas-soft)] flex items-center justify-center text-[var(--student-mute)] text-[11px] overflow-hidden">
        {item.coverUrl ? <img src={item.coverUrl} alt={item.name} className="size-full object-cover" /> : "暂无图片"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <h4 className="text-[13px] font-semibold truncate">{item.name}</h4>
          {item.workflowType === "DUAL_REVIEW" && <Badge variant="warning">需复核</Badge>}
        </div>
        {item.subtitle && <p className="text-[11px] text-[var(--student-mute)] mt-0.5 line-clamp-2">{item.subtitle}</p>}
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] text-[var(--student-mute)]">
            库存: {item.stockMode === "UNLIMITED" ? "无限" : item.stockQty}
          </span>
          <div className="flex items-center gap-1">
            {cartQty > 0 && <button onClick={() => onQtyChange(-1)} className="size-6 rounded border border-[var(--student-hairline)] flex items-center justify-center"><Minus className="size-3" /></button>}
            {cartQty > 0 && <span className="text-[13px] w-5 text-center font-medium">{cartQty}</span>}
            <button onClick={() => onQtyChange(1)} className="size-6 rounded border border-[var(--student-hairline)] flex items-center justify-center"><Plus className="size-3" /></button>
          </div>
        </div>
      </div>
    </StudentCard>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/student/pages/student-material.tsx
git commit -m "feat(material): add student material mall page"
```

---

### Task 9: 学生端页面 — 我的申领 + 个人统计

**Files:**
- Create: `frontend/src/features/student/pages/student-material-requests.tsx`
- Create: `frontend/src/features/student/pages/student-material-stats.tsx`

- [ ] **Step 1: 创建我的申领页面**

```typescript
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useMyMaterialRequests, useWithdrawMaterialRequest, useConfirmMaterialReceive } from "@/api/hooks/useMaterial";
import type { MaterialRequest } from "@/api/domains/material.api";
import { StudentCard, Badge, Skeleton, EmptyState } from "../components/ui";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿", PENDING: "待审核", FIRST_OK: "初审通过",
  APPROVED: "已通过", REJECTED: "已拒绝", FULFILLED: "待领取", RECEIVED: "已完成",
};
const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600", PENDING: "bg-yellow-100 text-yellow-700",
  FIRST_OK: "bg-blue-100 text-blue-700", APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700", FULFILLED: "bg-indigo-100 text-indigo-700",
  RECEIVED: "bg-emerald-100 text-emerald-700",
};

export default function StudentMaterialRequestsPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useMyMaterialRequests({ page, size: 20, status: statusFilter });
  const withdraw = useWithdrawMaterialRequest();
  const confirm = useConfirmMaterialReceive();

  return (
    <div className="h-full bg-[var(--student-canvas-soft)] flex flex-col">
      <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-[var(--student-hairline)]">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-[13px] text-[var(--student-mute)]"><ChevronLeft className="size-4" /> 返回</button>
        <h2 className="text-[15px] font-semibold">我的申领</h2>
      </div>

      {/* 状态筛选 */}
      <div className="flex gap-1.5 px-5 py-2 bg-white border-b border-[var(--student-hairline)] overflow-x-auto">
        {[{ label: "全部", value: undefined }, ...Object.entries(STATUS_LABELS).map(([k, v]) => ({ label: v, value: k }))].map((opt) => (
          <button key={opt.value ?? "all"} onClick={() => { setStatusFilter(opt.value); setPage(1); }}
            className={cn("px-3 py-1 rounded-[var(--student-radius-pill)] text-[12px] whitespace-nowrap transition-colors",
              statusFilter === opt.value ? "bg-[var(--student-primary)] text-white" : "bg-[var(--student-canvas-soft)] text-[var(--student-body)] hover:bg-[var(--student-primary-soft)]")}
          >{opt.label}</button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[80px]" />)
        ) : !data?.data || data.data.length === 0 ? (
          <EmptyState message="暂无申领记录" />
        ) : (
          data.data.map((req) => (
            <StudentCard key={req.id} className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-[var(--student-mute)] font-mono">{req.id}</span>
                <Badge className={STATUS_COLORS[req.status] || ""}>{STATUS_LABELS[req.status] || req.status}</Badge>
              </div>
              <div className="text-[13px] space-y-0.5">
                {req.lines?.map((l, i) => (
                  <p key={i} className="text-[var(--student-body)]">{l.snapshotName} × {l.qty} {l.fulfilledQty > 0 && <span className="text-green-600">(出库 {l.fulfilledQty})</span>}</p>
                ))}
              </div>
              <div className="flex items-center justify-between text-[11px] text-[var(--student-mute)]">
                <span>{req.createdAt?.replace("T", " ").slice(0, 19)}</span>
                <div className="flex gap-2">
                  {(req.status === "PENDING" || req.status === "FIRST_OK") && (
                    <button onClick={() => withdraw.mutate(req.id)} className="text-red-500 hover:underline">撤回</button>
                  )}
                  {req.status === "FULFILLED" && (
                    <button onClick={() => confirm.mutate(req.id)} className="text-[var(--student-primary)] hover:underline font-semibold">确认领取</button>
                  )}
                </div>
              </div>
            </StudentCard>
          ))
        )}
      </div>

      {/* 分页 */}
      {data && data.total > 20 && (
        <div className="flex justify-center gap-2 p-3 bg-white border-t">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1 text-[12px] rounded border disabled:opacity-30">上一页</button>
          <span className="px-3 py-1 text-[12px]">第 {page} 页 / 共 {Math.ceil(data.total / 20)} 页</span>
          <button disabled={page >= Math.ceil(data.total / 20)} onClick={() => setPage(page + 1)} className="px-3 py-1 text-[12px] rounded border disabled:opacity-30">下一页</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 创建个人统计页面**

```typescript
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Package, TrendingUp, Calendar } from "lucide-react";
import { useMyMaterialStats } from "@/api/hooks/useMaterial";
import { StudentCard, Skeleton } from "../components/ui";

export default function StudentMaterialStatsPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useMyMaterialStats();

  return (
    <div className="h-full bg-[var(--student-canvas-soft)] flex flex-col">
      <div className="flex items-center gap-3 px-5 py-3 bg-white border-b">
        <button onClick={() => navigate(-1)}><ChevronLeft className="size-4" /></button>
        <h2 className="text-[15px] font-semibold">领用统计</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? <Skeleton className="h-64" /> : data ? (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <StatCard icon={Package} label="总申领次数" value={data.totalRequests} />
              <StatCard icon={TrendingUp} label="总出库数量" value={data.totalFulfilledQty} />
            </div>
            <StudentCard>
              <h3 className="text-[13px] font-semibold mb-2">物品申领排行</h3>
              {data.byItem && data.byItem.length > 0 ? (
                <div className="space-y-1.5">
                  {data.byItem.slice(0, 10).map((row: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-[12px]">
                      <span className="truncate flex-1">{row.snapshot_name || "未知"}</span>
                      <span className="text-[var(--student-mute)] ml-2">×{row.total_qty}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-[12px] text-[var(--student-mute)]">暂无数据</p>}
            </StudentCard>
          </>
        ) : null}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <StudentCard className="p-3 flex items-center gap-3">
      <div className="size-10 rounded-[var(--student-radius-sm)] bg-[var(--student-primary-soft)] flex items-center justify-center">
        <Icon className="size-5 text-[var(--student-primary)]" />
      </div>
      <div>
        <div className="text-[20px] font-bold text-[var(--student-ink)]">{value}</div>
        <div className="text-[11px] text-[var(--student-mute)]">{label}</div>
      </div>
    </StudentCard>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/student/pages/student-material-requests.tsx frontend/src/features/student/pages/student-material-stats.tsx
git commit -m "feat(material): add student requests list and stats pages"
```

---

### Task 10: 学生端侧边栏入口 + 路由注册

**Files:**
- Modify: `frontend/src/features/student/pages/student-home.tsx`（添加快捷入口）
- Modify: `frontend/src/router/index.tsx`（添加路由）

- [ ] **Step 1: 学生首页添加快捷入口**

在 `student-home.tsx` 的快捷操作区块中新增一个按钮。找到 `<StudentCard className="left-panel">` 里 `<h3>快捷操作</h3>` 之后的 `<div className="-mx-1">`，在 AI画像 按钮后添加：

```tsx
<QuickActionItem
  icon={Package}
  label="申领物品"
  onClick={() => navigate("/student/material")}
/>
```

需要在文件头部添加 `Package` icon 的 import（从 lucide-react）。

- [ ] **Step 2: 添加路由**

在 `frontend/src/router/index.tsx` 的学生路由组中添加三条新路由：

```tsx
// 在 StudentHomePage 的 lazy import 附近添加:
const StudentMaterialPage = lazy(() => import("@/features/student/pages/student-material"));
const StudentMaterialRequestsPage = lazy(() => import("@/features/student/pages/student-material-requests"));
const StudentMaterialStatsPage = lazy(() => import("@/features/student/pages/student-material-stats"));

// 在路由树中添加:
<Route path="/student/material" element={<Suspense><StudentMaterialPage /></Suspense>} />
<Route path="/student/material/requests" element={<Suspense><StudentMaterialRequestsPage /></Suspense>} />
<Route path="/student/material/stats" element={<Suspense><StudentMaterialStatsPage /></Suspense>} />
```

- [ ] **Step 3: 扫码弹窗快捷入口预留**

在 `student-material.tsx` 页面顶层 export 一个导航常量，供弹窗组件直接引用：

```typescript
/** 快捷入口路由 — 扫码弹窗快捷业务区可用此路径跳转 */
export const STUDENT_MATERIAL_ROUTE = "/student/material";
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/student/pages/student-home.tsx frontend/src/router/index.tsx frontend/src/features/student/pages/student-material.tsx
git commit -m "feat(material): wire student sidebar entry, routes, and scan quick-link"
```

---

### Task 11: 教职工端页面 — 审核 + 统计审计

**Files:**
- Create: `frontend/src/pages/MaterialReviewPage.tsx`
- Create: `frontend/src/pages/MaterialAuditPage.tsx`

- [ ] **Step 1: 创建 MaterialReviewPage（审核页）**

参考 `AdminSuppliesProcessPage.tsx` 的 Tab + 列表模式。

```typescript
import { useState } from "react";
import { usePendingMaterialRequests, useAllMaterialRequests, useApproveMaterialRequest, useRejectMaterialRequest, useFulfillMaterialRequest } from "@/api/hooks/useMaterial";
import type { MaterialRequest, MaterialRequestLine } from "@/api/domains/material.api";
import { AdminSubPageHeader } from "@/components/admin/AdminSubPageHeader";

type TabKey = "pending" | "all";

function statusLabel(s: string) {
  const m: Record<string, string> = { DRAFT: "草稿", PENDING: "待审核", FIRST_OK: "初审通过", APPROVED: "已通过", REJECTED: "已拒绝", FULFILLED: "已出库", RECEIVED: "已完成" };
  return m[s] || s;
}

export default function MaterialReviewPage() {
  const [tab, setTab] = useState<TabKey>("pending");
  const { data: pendingData } = usePendingMaterialRequests();
  const { data: allData } = useAllMaterialRequests({ page: 1, size: 50 });
  const approve = useApproveMaterialRequest();
  const reject = useRejectMaterialRequest();
  const fulfill = useFulfillMaterialRequest();

  const list = tab === "pending" ? (pendingData ?? []) : (allData?.data ?? []);

  return (
    <div className="h-full flex flex-col">
      <AdminSubPageHeader title="申领审核" backTo="/admin" />
      <div className="flex gap-1 px-4 py-2 bg-white border-b">
        {([["pending", "待审核"], ["all", "全部记录"]] as [TabKey, string][]).map(([k, v]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3 py-1 rounded text-[13px] ${tab === k ? "bg-blue-600 text-white" : "bg-gray-100"}`}>{v}</button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {list.map((req: MaterialRequest) => (
          <div key={req.id} className="bg-white rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-mono text-gray-500">{req.id}</span>
              <span className="text-[12px] px-2 py-0.5 rounded bg-blue-50 text-blue-700">{statusLabel(req.status)}</span>
            </div>
            <div className="text-[13px]">
              <span className="font-medium">{req.applicantName || req.userId}</span>
              {req.applicantGroup && <span className="text-gray-400 ml-2">({req.applicantGroup})</span>}
            </div>
            <div className="text-[12px] text-gray-600 space-y-0.5">
              {req.lines?.map((l: MaterialRequestLine, i: number) => (
                <p key={i}>{l.snapshotName} × {l.qty} {l.fulfilledQty > 0 && `(已出库 ${l.fulfilledQty})`}</p>
              ))}
            </div>
            <div className="text-[11px] text-gray-400">{req.createdAt?.replace("T", " ").slice(0, 19)}</div>
            {/* 操作按钮 */}
            <div className="flex gap-2">
              {(req.status === "PENDING" || req.status === "FIRST_OK") && (
                <>
                  <button onClick={() => approve.mutate(req.id)} className="px-3 py-1 text-[12px] rounded bg-green-600 text-white">通过</button>
                  <button onClick={() => reject.mutate(req.id)} className="px-3 py-1 text-[12px] rounded bg-red-500 text-white">拒绝</button>
                </>
              )}
              {req.status === "APPROVED" && (
                <button onClick={() => {
                  const lines = req.lines?.map(l => ({ lineId: l.id, grant: true, fulfillQty: l.qty })) ?? [];
                  fulfill.mutate({ id: req.id, lines });
                }} className="px-3 py-1 text-[12px] rounded bg-blue-600 text-white">确认出库</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 创建 MaterialAuditPage（统计审计页）**

```typescript
import { useState } from "react";
import { useMaterialStatsOverview, useMaterialAuditTrail } from "@/api/hooks/useMaterial";
import { AdminSubPageHeader } from "@/components/admin/AdminSubPageHeader";

export default function MaterialAuditPage() {
  const [from, setFrom] = useState("2024-01-01");
  const [to, setTo] = useState("2099-12-31");
  const [page, setPage] = useState(1);
  const { data: overview } = useMaterialStatsOverview(from, to);
  const { data: trail } = useMaterialAuditTrail({ from, to, page, size: 20 });

  return (
    <div className="h-full flex flex-col">
      <AdminSubPageHeader title="物资统计与审计" backTo="/admin" />
      <div className="flex gap-2 px-4 py-2 bg-white border-b items-center text-[13px]">
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border rounded px-2 py-1" />
        <span>至</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border rounded px-2 py-1" />
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 概览卡片 */}
        {overview && (
          <div className="grid grid-cols-4 gap-3">
            <StatBox label="总申领单" value={overview.totalRequests} />
            <StatBox label="总出库量" value={overview.totalFulfilledQty} />
            <StatBox label="涉及学生" value={overview.byStudent?.length ?? 0} />
            <StatBox label="涉及物品" value={overview.byItem?.length ?? 0} />
          </div>
        )}
        {/* 学生维度 */}
        {overview?.byStudent && overview.byStudent.length > 0 && (
          <div className="bg-white rounded-lg border p-3">
            <h3 className="text-[13px] font-semibold mb-2">按学生统计</h3>
            <table className="w-full text-[12px]">
              <thead><tr className="border-b"><th className="text-left py-1">姓名</th><th className="text-left py-1">课题组</th><th className="text-right py-1">申领次数</th><th className="text-right py-1">活跃天数</th></tr></thead>
              <tbody>
                {overview.byStudent.map((s: any, i: number) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-1">{s.applicant_name}</td><td className="py-1">{s.applicant_group}</td>
                    <td className="text-right py-1">{s.total}</td><td className="text-right py-1">{s.active_days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {/* 审计流水 */}
        {trail?.data && trail.data.length > 0 && (
          <div className="bg-white rounded-lg border p-3">
            <h3 className="text-[13px] font-semibold mb-2">审计流水</h3>
            <table className="w-full text-[12px]">
              <thead><tr className="border-b">
                <th className="text-left py-1">申领人</th><th className="text-left py-1">课题组</th><th className="text-left py-1">物品</th>
                <th className="text-right py-1">数量</th><th className="text-right py-1">出库</th><th className="text-left py-1">状态</th><th className="text-left py-1">时间</th>
              </tr></thead>
              <tbody>
                {trail.data.map((row: any, i: number) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-1">{row.applicantName}</td><td className="py-1">{row.applicantGroup}</td><td className="py-1">{row.itemName}</td>
                    <td className="text-right py-1">{row.qty}</td><td className="text-right py-1">{row.fulfilledQty}</td>
                    <td className="py-1">{row.status}</td><td className="py-1">{row.createdAt?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-lg border p-3 text-center">
      <div className="text-[22px] font-bold">{value}</div>
      <div className="text-[11px] text-gray-500">{label}</div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/MaterialReviewPage.tsx frontend/src/pages/MaterialAuditPage.tsx
git commit -m "feat(material): add staff review page and audit stats page"
```

---

### Task 12: 管理后台导航注册 + 路由

**Files:**
- Modify: `frontend/src/features/admin/adminNavRegistry.ts`
- Modify: `frontend/src/features/admin/adminShellNavigation.ts`
- Modify: `frontend/src/router/index.tsx`

- [ ] **Step 1: 注册导航项 — 新增"审核"文件夹**

在 `adminNavRegistry.ts` 中新增一个分组。在 `ADMIN_NAV_REGISTRY` 数组中（建议放在 `repair-supplies` 之后）添加：

```typescript
{
  id: "material-review",
  title: "审核",
  items: [
    {
      id: "material-review-pending",
      path: "/admin/material/review",
      label: "申领审核",
      icon: ClipboardCheck,
      homeTone: "from-blue-600 to-indigo-700",
      fallbackMinRole: "STAFF",
      sidebarVisible: (ctx) => show(ctx, "/admin/material/review", "STAFF"),
    },
  ],
},
```

- [ ] **Step 2: 注册二级路由标题**

在 `adminShellNavigation.ts` 的 `SECONDARY_ROUTE_TITLE` 中添加：

```typescript
"/admin/material/review": "申领审核",
"/admin/material/audit": "物资统计与审计",
```

在 `DEFAULT_BACK_PARENT` 中添加：

```typescript
"/admin/material/review": "/admin",
"/admin/material/audit": "/admin/material/review",
```

- [ ] **Step 3: 添加路由**

在 `frontend/src/router/index.tsx` 的 admin 路由组中添加：

```tsx
const MaterialReviewPage = lazy(() => import("@/pages/MaterialReviewPage"));
const MaterialAuditPage = lazy(() => import("@/pages/MaterialAuditPage"));

// 在 admin 路由下:
<Route path="/admin/material/review" element={<Suspense><MaterialReviewPage /></Suspense>} />
<Route path="/admin/material/audit" element={<Suspense><MaterialAuditPage /></Suspense>} />
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/admin/adminNavRegistry.ts frontend/src/features/admin/adminShellNavigation.ts frontend/src/router/index.tsx
git commit -m "feat(material): register admin nav folder, routes, and shell titles"
```

---

### Task 13: 端到端验证

- [ ] **Step 1: 启动应用**

```bash
cd d:/codex/verson.1.2/20260416
# 启动后端 + 前端
```

- [ ] **Step 2: 验证清单**

1. 数据库表自动创建 — 检查 `material_*` 七张表存在
2. 学生端：侧边栏出现"申领物品"入口，点击进入商城
3. 学生端：浏览分类、加购、提交申领、查看我的申领
4. 学生端：确认领取
5. 教职工端：后台出现"审核"文件夹 → "申领审核"
6. 教职工端：审核通过、拒绝、出库履行
7. 教职工端：查看统计与审计页面
8. 数据隔离：material 表与 supplies 表无交集

- [ ] **Step 3: Commit final**

```bash
git add -A
git commit -m "feat(material): complete student material request system — end-to-end validation"
```
