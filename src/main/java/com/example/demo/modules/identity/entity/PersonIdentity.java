package com.example.demo.modules.identity.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** 人员身份映射：user_id + tag_id 唯一，多选、统一一套（key=staff_id）。 */
@Data
public class PersonIdentity {
    private Long id;
    private String userId;
    private Long tagId;
    private LocalDateTime createdAt;
}
