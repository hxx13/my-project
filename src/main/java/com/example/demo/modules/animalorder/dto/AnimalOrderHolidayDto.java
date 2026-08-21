package com.example.demo.modules.animalorder.dto;

import lombok.Data;

import java.time.LocalDate;

@Data
public class AnimalOrderHolidayDto {
    private Long id;
    private LocalDate holidayDate;
    private String dayType;
    private String name;
    private String source;
}
