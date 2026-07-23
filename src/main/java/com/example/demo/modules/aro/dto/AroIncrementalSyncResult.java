package com.example.demo.modules.aro.dto;

import java.util.LinkedHashMap;
import java.util.Map;

public class AroIncrementalSyncResult {
    private final boolean manualTrigger;
    private final int apiPages;
    private final int apiRecords;
    private final int candidates;
    private final int newInserted;
    private final String watermarkUsed;

    public AroIncrementalSyncResult(
            boolean manualTrigger,
            int apiPages,
            int apiRecords,
            int candidates,
            int newInserted,
            String watermarkUsed) {
        this.manualTrigger = manualTrigger;
        this.apiPages = apiPages;
        this.apiRecords = apiRecords;
        this.candidates = candidates;
        this.newInserted = newInserted;
        this.watermarkUsed = watermarkUsed;
    }

    public boolean isManualTrigger() {
        return manualTrigger;
    }

    public int getApiPages() {
        return apiPages;
    }

    public int getApiRecords() {
        return apiRecords;
    }

    public int getCandidates() {
        return candidates;
    }

    public int getNewInserted() {
        return newInserted;
    }

    public String getWatermarkUsed() {
        return watermarkUsed;
    }

    public String summary() {
        if (newInserted > 0) {
            return "穿甲弹同步：新增入库 " + newInserted + " 条（接口返回 " + apiRecords + " 条，候选 " + candidates + " 条）";
        }
        if (apiRecords == 0) {
            return "穿甲弹同步：官方接口未返回今日记录（请检查 ARO 登录与网络）";
        }
        if (candidates == 0) {
            return "穿甲弹同步：无新记录（水位线之后无候选，水位=" + watermarkUsed + "）";
        }
        return "穿甲弹同步：候选 " + candidates + " 条均已入库，无新增";
    }

    public Map<String, Object> metrics() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("manual", manualTrigger);
        m.put("apiPages", apiPages);
        m.put("apiRecords", apiRecords);
        m.put("candidates", candidates);
        m.put("newInserted", newInserted);
        m.put("watermark", watermarkUsed);
        return m;
    }
}
