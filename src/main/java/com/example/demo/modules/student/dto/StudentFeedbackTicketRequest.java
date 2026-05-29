package com.example.demo.modules.student.dto;

import lombok.Data;

@Data
public class StudentFeedbackTicketRequest {

    private String subject;
    private String content;
    private String type = "suggestion";
}
