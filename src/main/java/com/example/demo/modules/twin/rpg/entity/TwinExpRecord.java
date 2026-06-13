package com.example.demo.modules.twin.rpg.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class TwinExpRecord {
    private Long id;
    private String userId;
    private String userName;
    private Integer expAmount;
    private String sourceType;
    private Integer accessType;
    private String roomId;
    private String roomName;
    private LocalDateTime createTime;
}
