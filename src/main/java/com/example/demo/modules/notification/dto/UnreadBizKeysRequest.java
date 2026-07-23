package com.example.demo.modules.notification.dto;

import java.util.List;

public class UnreadBizKeysRequest {
    private List<BizKeyItem> keys;

    public List<BizKeyItem> getKeys() {
        return keys;
    }

    public void setKeys(List<BizKeyItem> keys) {
        this.keys = keys;
    }

    public static class BizKeyItem {
        private String bizType;
        private String bizId;

        public String getBizType() {
            return bizType;
        }

        public void setBizType(String bizType) {
            this.bizType = bizType;
        }

        public String getBizId() {
            return bizId;
        }

        public void setBizId(String bizId) {
            this.bizId = bizId;
        }
    }
}
