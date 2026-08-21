package com.example.demo.modules.agv.analysis.model;

import java.time.LocalDateTime;

/**
 * AGV 语义标签字典。
 *
 * <p>区域（{@link AgvSpatialElement#getSemanticTags()}）按 <b>名字</b> 引用标签，
 * 因此 {@code name} 在库中带全局唯一约束——名字即自然键。改名与删除必须走
 * {@code AgvTagController} 的级联路径，由服务端在同一事务内同步更新
 * {@code agv_spatial_element.semantic_tags} 与 {@code agv_tag_hidden.tag_name}，
 * 否则区域引用会失联。
 *
 * <p>{@code builtin=true} 的标签可改色，但不可改名、不可删除：
 * {@code AgvSpatialService.inferTags()} 自动生成区域时按名字硬编码打标签，
 * 内置标签的名字属于系统语义而非用户数据。
 */
public class AgvTag {
    private Long id;
    private String name;      // 全局唯一，区域按名引用
    private String color;     // hex，如 #22c55e
    private String scope;     // world=全局跨车 / agv=绑定某台车
    private String robotIp;   // scope=agv 时的归属车 IP
    private Boolean builtin;  // 内置标签：可改色，不可改名/删除
    private Integer sortOrder;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }
    public String getScope() { return scope; }
    public void setScope(String scope) { this.scope = scope; }
    public String getRobotIp() { return robotIp; }
    public void setRobotIp(String robotIp) { this.robotIp = robotIp; }
    public Boolean getBuiltin() { return builtin; }
    public void setBuiltin(Boolean builtin) { this.builtin = builtin; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
