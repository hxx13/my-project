package com.example.demo.modules.roommapping.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class RoomMappingChannel {
    private Long id;
    private String roomId;
    private String channelCode;
    private Integer sortOrder;
    private String label;
    private LocalDateTime createdAt;
}
