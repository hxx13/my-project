package com.example.demo.modules.notification.push.binding;

import com.example.demo.modules.notification.push.PushConstants;

public final class BindingMasker {
    private BindingMasker() {}

    static String mask(String channelCode, String target) {
        if (target == null) return null;
        if (PushConstants.CHANNEL_EMAIL.equals(channelCode)) {
            int at = target.indexOf('@');
            return at > 2 ? target.substring(0, 2) + "***" + target.substring(at) : target;
        }
        return target.length() > 10
                ? target.substring(0, 4) + "****" + target.substring(target.length() - 4)
                : "****";
    }
}
