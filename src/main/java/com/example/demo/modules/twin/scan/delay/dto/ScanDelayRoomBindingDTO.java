package com.example.demo.modules.twin.scan.delay.dto;

import lombok.Data;

import java.util.List;

@Data
public class ScanDelayRoomBindingDTO {
    private String roomId;
    private List<Long> optionIds;
}
