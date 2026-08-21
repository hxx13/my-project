package com.example.demo.modules.animalorder.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.time.LocalTime;

@Data
public class AnimalOrderWindowRuleDto {
    private Long id;
    private String scope;
    private String categoryKey;
    private String effect;
    private String shape;
    /** ISO weekdays comma-separated, e.g. "1,2,3,4,5" (1=Mon … 7=Sun); Form A WEEKLY */
    private String weekdays;
    /** Form B WEEKLY_SPAN: start ISO weekday 1–7 */
    private Integer startWeekday;
    /** Form B WEEKLY_SPAN: end ISO weekday 1–7 */
    private Integer endWeekday;
    private LocalTime dailyStartTime;
    private LocalTime dailyEndTime;
    private LocalDateTime rangeStartAt;
    private LocalDateTime rangeEndAt;
    private String label;
    private Integer sortOrder;
    private Integer active;
}
