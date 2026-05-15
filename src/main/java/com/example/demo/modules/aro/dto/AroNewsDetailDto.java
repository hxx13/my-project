package com.example.demo.modules.aro.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 新闻详情（与 pages/newsDetail 展示字段对齐）。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AroNewsDetailDto {
    private String id;
    private String newsName;
    private String createTime;
    /** 富文本 HTML，rich-text nodes 使用 */
    private String newsContent;
}
