package com.example.demo.modules.student.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class StudentNotificationResponse {

    private String id;
    private String title;
    private String summary;
    private String type;
    private LocalDateTime publishDate;
    private boolean isRead;
    private String sourceUrl;
}
