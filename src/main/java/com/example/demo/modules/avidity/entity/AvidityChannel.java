package com.example.demo.modules.avidity.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 安维迪仪表盘「通道」——页面顶部那排 tab（交医-2 / 交医-B1 / 交医-隔离包）。
 * 平台侧一个 tab 是一个 Dashboard，tab 内容块再指向设备，这里摊平成「通道 × 设备」一行。
 * 见 db/bootstrap-avidity-channel.sql。
 */
@Data
public class AvidityChannel {

    private Long id;

    /** 平台侧 Dashboard ID */
    private Long channelId;

    /** 通道名 */
    private String channelName;

    /** 平台排序号，前端 tab 顺序照它排 */
    private Integer sortIndex;

    private Long virtualDeviceId;

    private String deviceName;

    /** 厂平台组态画面 ID：对应 resources/avidity/&lt;该值&gt;.json 那份平面图布局。 */
    private Long configureViewId;

    private LocalDateTime syncedAt;
}
