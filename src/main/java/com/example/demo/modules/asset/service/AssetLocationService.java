package com.example.demo.modules.asset.service;

import org.springframework.stereotype.Service;

/**
 * 资产存放地点树服务。
 * P1 阶段：仅提供地点名称归一化纯函数（播种/CRUD 共用）；CRUD 与树构建在后续任务补齐。
 */
@Service
public class AssetLocationService {

    /**
     * 地点名称归一化：去首尾空白，连续空白（含全角空格）压成单个半角空格；空白串或 null 返回 null。
     */
    public static String normalizeLocationName(String raw) {
        if (raw == null) {
            return null;
        }
        String s = raw.replaceAll("[\\s\\u3000]+", " ").trim();
        return s.isEmpty() ? null : s;
    }
}
