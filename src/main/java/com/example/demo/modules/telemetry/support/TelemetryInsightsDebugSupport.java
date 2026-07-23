package com.example.demo.modules.telemetry.support;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 遥测历史分析页排障开关：请求头 {@code X-Telemetry-Insights-Debug: 1} 或查询参数 {@code debug=1}。
 */
public final class TelemetryInsightsDebugSupport {

    private TelemetryInsightsDebugSupport() {}

    public static boolean enabled(HttpServletRequest request) {
        if (request == null) {
            return false;
        }
        String header = request.getHeader("X-Telemetry-Insights-Debug");
        if ("1".equals(header) || "true".equalsIgnoreCase(header)) {
            return true;
        }
        String param = request.getParameter("debug");
        return "1".equals(param) || "true".equalsIgnoreCase(param);
    }
}
