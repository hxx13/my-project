package com.example.demo.modules.accessfusion.service;

import com.example.demo.modules.accessfusion.entity.AccessRawEvent;
import com.example.demo.modules.twin.dahua.entity.DahuaSwingRecord;

/**
 * 门禁清洗「人员」维度：以刷卡人实体（工号/姓名/卡号）为准，不用 mappingUserId 做去抖，
 * 避免多人映射到同一系统用户时互相吞记录。
 */
final class AccessPersonIdentity {

    private AccessPersonIdentity() {}

    static String personIdentityKey(AccessRawEvent e) {
        if (e == null) {
            return "unknown";
        }
        return personIdentityKey(
                e.getPersonCode(),
                e.getPersonName(),
                e.getCardNumber(),
                e.getMappingUserId(),
                e.getRecordId());
    }

    static String personIdentityKey(DahuaSwingRecord s) {
        if (s == null) {
            return "unknown";
        }
        return personIdentityKey(
                s.getPersonCode(),
                s.getPersonName(),
                s.getCardNumber(),
                s.getMappingUserId(),
                s.getRecordId());
    }

    static String personChannelDebounceKey(AccessRawEvent e) {
        String channel = e != null && e.getChannelCode() != null ? e.getChannelCode().trim() : "";
        return personIdentityKey(e) + "|" + channel;
    }

    private static String personIdentityKey(
            String personCode,
            String personName,
            String cardNumber,
            String mappingUserId,
            String recordId) {
        if (hasText(personCode)) {
            return "pc:" + personCode.trim();
        }
        if (hasText(personName)) {
            return "pn:" + personName.trim();
        }
        if (hasText(cardNumber)) {
            return "card:" + cardNumber.trim();
        }
        if (hasText(mappingUserId)) {
            return "uid:" + mappingUserId.trim();
        }
        if (hasText(recordId)) {
            return "rid:" + recordId.trim();
        }
        return "unknown";
    }

    private static boolean hasText(String s) {
        return s != null && !s.isBlank();
    }
}
