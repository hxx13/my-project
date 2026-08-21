package com.example.demo.modules.animalorder.entity;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
public class AnimalOrderHoliday {
    private Long id;
    private LocalDate holidayDate;
    private String dayType;          // HOLIDAY | WORKDAY_SHIFT
    private String name;
    private String source;           // IMPORT | CDN | MANUAL
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
