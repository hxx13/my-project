package com.example.demo.modules.institution.entity;

import lombok.Data;

/**
 * 院校字典（学院/机构/医院）。type 区分机构类型，供 AUP 注册号 letter 后缀与人员归属筛选使用。
 */
@Data
public class Institution {
    private Long id;
    /** 稳定标识（环境变量种子可配），如 SJTU / RUJIN */
    private String code;
    /** 院校名称 */
    private String name;
    /** 机构类型：INSIDE=校内 / HOSPITAL=附属医院 / OTHER=其他科研机构 */
    private String type;
    private Integer sortOrder;
    private Integer active;
    private String createdAt;
}
