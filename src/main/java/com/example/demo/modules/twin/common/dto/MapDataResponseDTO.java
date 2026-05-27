package com.example.demo.modules.twin.common.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class MapDataResponseDTO {
    private Map<String, Object> data;
}
