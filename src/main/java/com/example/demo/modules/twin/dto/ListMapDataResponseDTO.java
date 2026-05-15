package com.example.demo.modules.twin.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ListMapDataResponseDTO {
    private List<Map<String, Object>> data;
}
