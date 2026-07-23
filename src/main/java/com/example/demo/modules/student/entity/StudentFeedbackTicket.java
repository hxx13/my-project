package com.example.demo.modules.student.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class StudentFeedbackTicket {

    private Long id;
    private String userId;
    private String subject;
    private String content;
    private String type;
    private String status;
    private String replyContent;
    private String repliedBy;
    private LocalDateTime repliedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
