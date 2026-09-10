package com.example.demo.modules.cageshelf.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 笼位同步保护锁：scope_type + scope_key 唯一。
 * locked=1 同步时跳过该节点；=0 显式解锁（白名单，上级锁了这层也同步）；无该行 = 继承上级。
 */
@Data
public class CageSyncLock {
    private Long id;
    private String scopeType;      // FLOOR | ROOM | SHELF | CELL
    private String scopeKey;       // floor_id / room_id / shelve_id / animal_cage_id 字符串化
    private Boolean locked;        // 1=锁定跳过 0=显式解锁
    private String reason;
    private String operatorId;
    private String operatorName;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
