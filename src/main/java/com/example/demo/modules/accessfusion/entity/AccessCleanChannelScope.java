package com.example.demo.modules.accessfusion.entity;

import lombok.Data;

@Data
public class AccessCleanChannelScope {
    private Long id;
    private Long statsTaskId;
    private String channelCode;
    private String channelName;
    private Integer enabled;
}
