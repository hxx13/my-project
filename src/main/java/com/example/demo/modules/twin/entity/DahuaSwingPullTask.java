package com.example.demo.modules.twin.entity;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class DahuaSwingPullTask {
    private Long id;
    private String name;
    private Integer enabled;
    private Integer pollIntervalSeconds;
    private String queryJson;
    private String activationRulesJson;
    private String lastCursorTime;
    private String lastStatus;
    private String lastError;
    private String lastRunAt;
    private String createdAt;
    private String updatedAt;
}
