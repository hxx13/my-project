package com.example.demo.modules.animalorder.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class HolidayImportResultDto {
    private int upserted;
    private int year;
    private List<String> warnings = new ArrayList<>();
}
