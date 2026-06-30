package com.example.demo.modules.twin.scan.delay.dto;

import lombok.Data;

@Data
public class ScanDelayCarrierDTO {
    private Long id;
    private String buttonLabel;
    private boolean enabled;
    private int sortOrder;
    /** 该载体下二级菜单项数量（列表接口附带） */
    private int optionCount;
    /** 已分配的菜单项 ID（管理端配置） */
    private java.util.List<Long> optionIds;
}
