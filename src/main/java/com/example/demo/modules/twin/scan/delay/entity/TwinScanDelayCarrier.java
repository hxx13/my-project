package com.example.demo.modules.twin.scan.delay.entity;

import lombok.Data;

/** 扫码延迟载体按钮（其下挂多条二级菜单选项） */
@Data
public class TwinScanDelayCarrier {
    private Long id;
    private String buttonLabel;
    private Integer enabled;
    private Integer sortOrder;
}
