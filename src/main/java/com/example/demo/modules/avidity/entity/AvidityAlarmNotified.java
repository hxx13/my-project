package com.example.demo.modules.avidity.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 安维迪报警的已推送台账。既是去重依据，也是事后可查的留痕。
 * 见 db/bootstrap-avidity-alarm-notified.sql。
 */
@Data
public class AvidityAlarmNotified {

    private Long id;

    /** NEW:&lt;报警ID&gt; 或 COUNT:&lt;日&gt;:&lt;设备ID&gt;:&lt;告警名&gt; */
    private String notifyKey;

    private String ruleCode;

    private String deviceName;

    private String alarmName;

    private String message;

    private LocalDateTime notifiedAt;
}
