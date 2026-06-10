package com.example.demo.modules.material.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class MaterialCart {
    private String userId;
    private String linesJson;
    private LocalDateTime updatedAt;
}
