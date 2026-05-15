package com.example.demo.modules.twin.service;

import org.springframework.stereotype.Component;

/**
 * 长任务同步（多页拉取）的中断开关：前端「暂停」置位，循环内检测后立即收尾。
 */
@Component
public class LongRunningSyncCancel {

    private volatile boolean accessLogSyncCancel;
    private volatile boolean animalOrderSyncCancel;

    public void clearAccessLogSyncCancel() {
        accessLogSyncCancel = false;
    }

    public void requestAccessLogSyncCancel() {
        accessLogSyncCancel = true;
    }

    public boolean isAccessLogSyncCancelled() {
        return accessLogSyncCancel;
    }

    public void clearAnimalOrderSyncCancel() {
        animalOrderSyncCancel = false;
    }

    public void requestAnimalOrderSyncCancel() {
        animalOrderSyncCancel = true;
    }

    public boolean isAnimalOrderSyncCancelled() {
        return animalOrderSyncCancel;
    }
}
