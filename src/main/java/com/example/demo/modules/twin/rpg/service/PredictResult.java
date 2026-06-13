package com.example.demo.modules.twin.rpg.service;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class PredictResult {
    private int expAdded;
    private String expSource; // "FIRST_ENTRY" | "TIME_BASED" | null
}
