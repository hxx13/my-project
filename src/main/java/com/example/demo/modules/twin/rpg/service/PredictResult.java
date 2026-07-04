package com.example.demo.modules.twin.rpg.service;

import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class PredictResult {
    private int expAdded;
    private String expSource; // "FIRST_ENTRY" | "TIME_BASED" | null
    private Integer sessionDurationMinutes;

    public PredictResult(int expAdded, String expSource) {
        this.expAdded = expAdded;
        this.expSource = expSource;
    }

    public PredictResult(int expAdded, String expSource, Integer sessionDurationMinutes) {
        this.expAdded = expAdded;
        this.expSource = expSource;
        this.sessionDurationMinutes = sessionDurationMinutes;
    }
}
