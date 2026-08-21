package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP 中心/机构（跨中心扩展）。 */
@Data
public class CrfCenter {
    private Long id;
    /** 中心码 SJ/SH/RJ/XH/HS */
    private String code;
    private String name;
    private Boolean active;
    private LocalDateTime createdAt;
}
