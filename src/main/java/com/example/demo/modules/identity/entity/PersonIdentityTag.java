package com.example.demo.modules.identity.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** 人员身份标识字典（内置组长/秘书/专家三个默认标签种子（code 稳定，环境变量可配），其余管理员配置）。id 由数据库自增生成。 */
@Data
public class PersonIdentityTag {
    private Long id;
    /** 稳定标识，如 GROUP_LEADER/SECRETARY/EXPERT（唯一，落库稳定，不随展示文案变化）。 */
    private String code;
    private String label;
    private Integer sortOrder;
    private Integer active;
    private LocalDateTime createdAt;
}
