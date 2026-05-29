package com.example.demo.modules.student.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class StudentViolationResponse {

    private String id;
    private LocalDateTime time;
    private String type;
    private String roomName;
    private String doorName;
    private String description;
    private String penalty;
    private String status;
    private String processedBy;
    private LocalDateTime processedTime;
}
