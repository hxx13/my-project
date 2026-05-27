package com.example.demo.modules.accessfusion.entity;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
public class AccessVisitRound {
    private Long id;
    private Long batchId;
    private String userId;
    private String roomId;
    private String roomName;
    private LocalDate roundDate;
    private LocalDateTime enterTime;
    private LocalDateTime exitTime;
    private Long enterCleanedEventId;
    private Long exitCleanedEventId;
    private String status;
}
