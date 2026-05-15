package com.example.demo.modules.aro.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 小程序新闻列表项（字段名与首页 / 新闻中心 WXML 对齐）。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AroNewsSummaryDto {
    private String id;
    private String newsName;
    private String createTime;
}
