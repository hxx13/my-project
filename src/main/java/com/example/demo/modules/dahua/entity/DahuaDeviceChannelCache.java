package com.example.demo.modules.dahua.entity;

import lombok.Data;

@Data
public class DahuaDeviceChannelCache {
    private Long id;
    private String deviceCode;
    private Integer unitType;
    private String unitSeq;
    private String channelSeq;
    private String channelCode;
    private String channelSn;
    private String channelName;
    private String channelType;
    private String cameraType;
    private String ownerCode;
    private String gpsX;
    private String gpsY;
    private String gpsZ;
    private String mapId;
    private String domainId;
    private String memo;
    private Integer isOnline;
    private String stat;
    private String sleepStat;
    private String accessS;
    private String capability;
    private String chExt;
    private Integer isVirtual;
    private Integer deviceCategory;
    private Integer deviceType;
    /** 本地备注分类 ID，与 {@link #remarkCategoryName} 一并用于列表展示 */
    private Long remarkCategoryId;
    private String remarkCategoryName;
    private String updatedAt;
}
