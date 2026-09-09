package com.example.demo.modules.animalorder.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class AnimalOrderTimePolicyAdminDto {
    /** 浦东 | 浦西 */
    private String campus;
    private String defaultMode;
    private String etaMode;
    private Integer etaWorkdayOffset;
    /** FIXED: ISO weekday 1=Mon … 7=Sun */
    private Integer etaWeekday;
    private List<AnimalOrderWindowRuleDto> rules = new ArrayList<>();
}
