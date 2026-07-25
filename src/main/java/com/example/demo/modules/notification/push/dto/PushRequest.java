package com.example.demo.modules.notification.push.dto;

import lombok.Builder;
import lombok.Data;
import java.util.Map;
import java.util.Set;

@Data
@Builder
public class PushRequest {
    private String sourceCode;
    private Map<String, String> variables;
    private Set<String> targetUserIds;
}
