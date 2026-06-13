package com.example.demo.modules.admin.pagehelp;

import org.springframework.util.StringUtils;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

/** 页面帮助路由规范化（读宽、写窄） */
public final class PageHelpPathUtil {

    private static final int MAX_PATH_LEN = 512;

    private PageHelpPathUtil() {
    }

    public static String decodeTrim(String raw) {
        if (raw == null) {
            return "";
        }
        return URLDecoder.decode(raw.trim(), StandardCharsets.UTF_8);
    }

    public static String normalizeForRead(String raw) {
        String p = decodeTrim(raw);
        if (!StringUtils.hasText(p)) {
            return null;
        }
        if (!p.startsWith("/")) {
            p = "/" + p;
        }
        if (p.length() > MAX_PATH_LEN) {
            p = p.substring(0, MAX_PATH_LEN);
        }
        if (p.contains("..")) {
            return null;
        }
        while (p.length() > 1 && p.endsWith("/")) {
            p = p.substring(0, p.length() - 1);
        }
        if ("/login".equals(p) || p.startsWith("/student/login")) {
            return null;
        }
        return p;
    }

    /** 管理端编辑：有效 Web 路由（与读取范围一致） */
    public static String normalizeForAdminWrite(String raw) {
        return normalizeForRead(raw);
    }
}
