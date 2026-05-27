package com.example.demo.modules.accessfusion.entity;

import lombok.Data;

@Data
public class AccessCleanTaskSettings {
    private Long statsTaskId;
    private Integer debounceSeconds;
    /** 1=定时任务自动增量清洗并打包落库；0=仅手动试算合并 */
    private Integer autoCleanPackage;
    /** ALL | ENTER | EXIT */
    private String swingDirectionFilter;
}
