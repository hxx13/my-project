package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP 访视方案：一组 TP 时点定义（项目选用方案决定事件矩阵列与工作区 TP 导航）。 */
@Data
public class CrfVisitScheme {
    private Long id;
    private String name;
    private String description;
    private Boolean active;
    private LocalDateTime createdAt;
}
