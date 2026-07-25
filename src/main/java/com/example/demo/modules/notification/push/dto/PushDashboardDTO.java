package com.example.demo.modules.notification.push.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class PushDashboardDTO {
    private int totalSources;
    private int enabledSources;
    private int disabledSources;
    private long sent24h;
    private long success24h;
    private long failed24h;
    private ChannelHealth emailHealth;
    private ChannelHealth serverChanHealth;

    @Data
    @Builder
    public static class ChannelHealth {
        private String channelCode;
        private String channelName;
        private boolean enabled;
        private String status;
        private long failed10min;
    }
}
