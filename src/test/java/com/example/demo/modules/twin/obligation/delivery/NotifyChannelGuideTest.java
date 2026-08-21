package com.example.demo.modules.twin.obligation.delivery;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class NotifyChannelGuideTest {

    @Test
    void redirectPaths() {
        assertEquals("/student/obligations?focus=9", NotifyChannelGuide.redirectPath(9));
        assertTrue(NotifyChannelGuide.redirectPathForChannel("MP", 3).contains("studentObligation"));
        assertTrue(NotifyChannelGuide.message().contains("扫码"));
    }
}
