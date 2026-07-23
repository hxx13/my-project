package com.example.demo.modules.knowledge.model;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class TimelineResponse {
    private Long id;
    private Long pageId;
    private String pageTitle;
    private String categoryName;
    private String type; // created / edited / imported / rollback
    private String author;
    private String summary;
    private LocalDateTime createdAt;
}
