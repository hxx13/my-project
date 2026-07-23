package com.example.demo.modules.student.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class StudentRoomPin {

    private Long id;
    private String userId;
    private String roomName;
    private LocalDateTime createdAt;
}
