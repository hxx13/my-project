package com.example.demo.modules.twin.obligation.delivery;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ChannelDeliveryPolicyTest {

    @Test
    void interactiveStrategyOnNotifyDegrades() {
        assertEquals(
                ChannelDeliveryPolicy.Mode.GUIDE_ONLY,
                ChannelDeliveryPolicy.resolve(true, "NOTIFY"));
    }

    @Test
    void interactiveStrategyOnScanStaysFull() {
        assertEquals(
                ChannelDeliveryPolicy.Mode.FULL_DISPOSITION,
                ChannelDeliveryPolicy.resolve(true, "SCAN"));
    }

    @Test
    void showOnlyNeverDegrades() {
        assertEquals(
                ChannelDeliveryPolicy.Mode.FULL_DISPOSITION,
                ChannelDeliveryPolicy.resolve(false, "NOTIFY"));
        assertEquals(
                ChannelDeliveryPolicy.Mode.FULL_DISPOSITION,
                ChannelDeliveryPolicy.resolve(false, "SCAN"));
    }
}
