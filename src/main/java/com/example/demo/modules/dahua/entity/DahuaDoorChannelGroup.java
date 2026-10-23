package com.example.demo.modules.dahua.entity;

import lombok.Data;

@Data
public class DahuaDoorChannelGroup {
    private Long id;
    private String name;
    /** 通道编码，逗号分隔 */
    private String channelCodes;
    private String updatedAt;
}
