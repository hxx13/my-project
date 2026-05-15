package com.example.demo.modules.telemetry.animalroom.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MpSoloRowDto {
    @Builder.Default
    private List<MpRoomCardDto> cards = new ArrayList<>();
}
