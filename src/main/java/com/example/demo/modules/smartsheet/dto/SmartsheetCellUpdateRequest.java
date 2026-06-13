package com.example.demo.modules.smartsheet.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class SmartsheetCellUpdateRequest {
    @NotBlank(message = "列名不能为空")
    private String columnKey;

    @NotNull(message = "值不能为空")
    private Object value;

    @NotNull(message = "版本号不能为空")
    private Integer expectedVersion;
}
