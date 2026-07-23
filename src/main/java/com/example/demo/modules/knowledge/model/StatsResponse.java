package com.example.demo.modules.knowledge.model;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class StatsResponse {
    private int totalPages;
    private int totalCategories;
    private int totalTags;
    private LocalDateTime lastUpdated;
}
