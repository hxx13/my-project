package com.example.demo.modules.nhp.entity;

import lombok.Data;

/** NHP 数据访问组成员。 */
@Data
public class CrfDagUser {
    private Long id;
    private Long dagId;
    private String personnelId;
}
