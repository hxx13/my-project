package com.example.demo.modules.identity.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** 人员负责范围：user_id（personnel.id）+ scope_type + scope_id 唯一。 */
@Data
public class PersonScope {
    private Long id;
    private String userId;
    private String scopeType;   // CAMPUS | FLOOR | ROOM
    private String scopeId;     // cage_shelf_index 的 campus_id / floor_id / room_id 字符串化
    private LocalDateTime createdAt;
}
