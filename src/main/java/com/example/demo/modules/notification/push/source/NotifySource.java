package com.example.demo.modules.notification.push.source;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class NotifySource {
    private Long id;
    private String sourceCode;
    private String sourceName;
    private String description;
    private String variables;
    private Integer enabled;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
