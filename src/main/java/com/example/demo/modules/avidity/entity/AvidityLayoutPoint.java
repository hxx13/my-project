package com.example.demo.modules.avidity.entity;

import lombok.Data;

/**
 * 平面图上一个点位的手动摆位覆盖（后台拖拽保存）。
 * 布局本身是静态资源，这张表只存「挪过的那几个」，取图时覆盖上去。
 * 见 db/bootstrap-avidity-layout-point.sql。
 */
@Data
public class AvidityLayoutPoint {

    private Long id;

    private Long channelId;

    /** 房间/区名，如 205 / E11A */
    private String roomCode;

    /** 笼架标识，与告警名对应，如 205-A / E11A-B105 */
    private String rackCode;

    private Integer pointNo;

    /** 格左上角 x（与布局资源同一口径，不是格心） */
    private Integer posX;

    /** 格左上角 y */
    private Integer posY;
}
