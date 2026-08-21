package com.example.demo.modules.twin.obligation.delivery;

/**
 * 期 4 · 渠道能力。交互处置只能落在 INTERACTIVE 渠道；NOTIFY_ONLY 自动降级为引导。
 */
public enum ChannelCapability {
    INTERACTIVE,
    NOTIFY_ONLY;

    public static ChannelCapability forChannel(String channel) {
        if (channel == null || channel.isBlank()) {
            return INTERACTIVE;
        }
        return switch (channel.trim().toUpperCase()) {
            case "NOTIFY", "SMS", "EMAIL", "INBOX" -> NOTIFY_ONLY;
            default -> INTERACTIVE;
        };
    }
}
