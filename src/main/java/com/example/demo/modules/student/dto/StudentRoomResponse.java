package com.example.demo.modules.student.dto;

import lombok.Data;

@Data
public class StudentRoomResponse {

    private String roomId;
    private String roomName;
    private String floor;
    private String zone;
    private int occupantCount;
    private int capacity;
    private int occupancyRate;
    private String status;
    private boolean isPinned;
}
