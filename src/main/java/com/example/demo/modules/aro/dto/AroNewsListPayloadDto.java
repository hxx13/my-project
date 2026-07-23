package com.example.demo.modules.aro.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/** 二次封装：列表载体，对应小程序原先用法的 {@code res.data.list} */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AroNewsListPayloadDto {
    private List<AroNewsSummaryDto> list;
}
