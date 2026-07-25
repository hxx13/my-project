package com.example.demo.modules.notification.push.dto;

import lombok.Data;
import java.util.List;
import java.util.Map;

@Data
public class NotifySourceConfigDTO {
    private Long sourceId;
    private String sourceCode;
    private String sourceName;
    private String description;
    private Map<String, String> variables;
    private Boolean sourceEnabled;
    private List<ChannelConfig> channels;
    private List<RecipientConfig> recipients;

    @Data
    public static class ChannelConfig {
        private Long id;
        private String channelCode;
        private String channelName;
        private Boolean enabled;
        private String titleTpl;
        private String contentTpl;
        private String quietStart;
        private String quietEnd;
        private Integer rateLimitSeconds;
    }

    @Data
    public static class RecipientConfig {
        private Long id;
        private String perspective;
        private String scopeType;
        private String scopeValue;
        /** 人员显示名（由服务端解析 scopeValue → 姓名） */
        private String scopeLabel;
    }
}
