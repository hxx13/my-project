package com.example.demo.modules.student.service;

import org.springframework.stereotype.Service;

/**
 * 手机 H5 进出状态：扫码/门禁联动等事件发生时推送，客户端按需拉 room-dashboard，避免轮询。
 */
@Service
public class MobilePresenceNotifyService {

    private final MobileUserSocketPushService pushService;

    public MobilePresenceNotifyService(MobileUserSocketPushService pushService) {
        this.pushService = pushService;
    }

    /** reason 示例：scan_enter / timer_cleared / timer_cleared:pending_activation */
    public void notifyPresenceChanged(String userId, String reason) {
        if (userId == null || userId.isBlank()) {
            return;
        }
        String tag = reason != null && !reason.isBlank() ? reason.trim() : "changed";
        pushService.pushRefresh(userId.trim(), "presence:" + tag);
    }

    /** 联动计时器被销毁（无新计时器接替时，手机端应停止倒计时展示） */
    public void notifyTimerCleared(String userId, String scope) {
        if (scope == null || scope.isBlank()) {
            notifyPresenceChanged(userId, "timer_cleared");
        } else {
            notifyPresenceChanged(userId, "timer_cleared:" + scope.trim());
        }
    }
}
