package com.example.demo.modules.twin.dto;

import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
public class GroupedOrderAdminResponseDTO {
    private int total;
    private Map<String, Object> row1Summary;
    private List<Map<String, Object>> detailLogs;
}
