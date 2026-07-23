package com.example.demo.modules.invite;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

public final class InviteCodeHasher {

    private InviteCodeHasher() {
    }

    public static String normalize(String code) {
        if (code == null) {
            return "";
        }
        return code.trim().toUpperCase().replaceAll("\\s+", "");
    }

    public static String sha256Hex(String pepper, String normalizedCode) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            String payload = pepper + "|" + normalizedCode;
            byte[] digest = md.digest(payload.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }
}
