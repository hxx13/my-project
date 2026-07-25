package com.example.demo.modules.notification.push.channel;

import lombok.Data;

@Data
public class PushResult {
    private final boolean success;
    private final String providerMsgId;
    private final String errorCode;
    private final String errorMsg;

    private PushResult(boolean success, String providerMsgId, String errorCode, String errorMsg) {
        this.success = success;
        this.providerMsgId = providerMsgId;
        this.errorCode = errorCode;
        this.errorMsg = errorMsg;
    }

    public static PushResult ok(String providerMsgId) {
        return new PushResult(true, providerMsgId, null, null);
    }

    public static PushResult fail(String errorCode, String errorMsg) {
        return new PushResult(false, null, errorCode, errorMsg);
    }
}
