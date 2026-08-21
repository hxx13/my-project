package com.example.demo.modules.animalorder.dto;

import lombok.Data;

import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;

@Data
public class AnimalOrderTimePolicySummaryDto {
    private String defaultMode;
    private boolean canOrderNow;
    private String closedReason;
    private ZonedDateTime nextOpenAt;
    private String etaMode;
    private LocalDate estimatedDeliveryDate;
    private Integer etaWorkdayOffset;
    /** FIXED: ISO weekday 1=Mon … 7=Sun */
    private Integer etaWeekday;
    private List<String> warnings = new ArrayList<>();
}
