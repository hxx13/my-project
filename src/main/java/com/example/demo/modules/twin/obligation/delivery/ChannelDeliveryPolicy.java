package com.example.demo.modules.twin.obligation.delivery;

/**
 * 期 4 · 渠道降级规则（计算得出，非按渠道硬编码 if-else 清单）。
 *
 * <p>当「策略需交互」且「渠道 notify-only」时，该渠道不渲染处置区，只投递引导。
 */
public final class ChannelDeliveryPolicy {

    public enum Mode {
        /** 完整处置 UI */
        FULL_DISPOSITION,
        /** 仅引导跳转至 interactive 渠道 */
        GUIDE_ONLY
    }

    private ChannelDeliveryPolicy() {
    }

    public static Mode resolve(boolean strategyRequiresInteraction, ChannelCapability channel) {
        if (strategyRequiresInteraction && channel == ChannelCapability.NOTIFY_ONLY) {
            return Mode.GUIDE_ONLY;
        }
        return Mode.FULL_DISPOSITION;
    }

    public static Mode resolve(boolean strategyRequiresInteraction, String channelCode) {
        return resolve(strategyRequiresInteraction, ChannelCapability.forChannel(channelCode));
    }
}
