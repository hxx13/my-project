package com.example.demo.modules.twin.common.event;

import org.springframework.context.ApplicationEvent;

/**
 * 笼架全量同步完成后发布的事件，供笼架违规判定引擎消费。
 */
public class CageScanCompletedEvent extends ApplicationEvent {
    private final String scanBatchId;
    private final String triggeredBy;

    public CageScanCompletedEvent(Object source, String scanBatchId, String triggeredBy) {
        super(source);
        this.scanBatchId = scanBatchId;
        this.triggeredBy = triggeredBy;
    }

    public String getScanBatchId() {
        return scanBatchId;
    }

    public String getTriggeredBy() {
        return triggeredBy;
    }
}
