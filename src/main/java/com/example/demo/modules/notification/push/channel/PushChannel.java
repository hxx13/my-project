package com.example.demo.modules.notification.push.channel;

public interface PushChannel {
    String getCode();
    String getDisplayName();
    boolean isEnabled();
    PushResult send(String target, String title, String content);
}
