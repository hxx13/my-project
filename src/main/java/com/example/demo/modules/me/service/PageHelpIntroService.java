package com.example.demo.modules.me.service;

import com.example.demo.modules.admin.pagehelp.PageHelpPathUtil;
import com.example.demo.modules.admin.pagehelp.PageHelpService;
import com.example.demo.modules.me.dto.MiniPreferencesVo;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class PageHelpIntroService {

    private final PageHelpService pageHelpService;
    private final MiniPreferencesService miniPreferencesService;

    public PageHelpIntroService(PageHelpService pageHelpService, MiniPreferencesService miniPreferencesService) {
        this.pageHelpService = pageHelpService;
        this.miniPreferencesService = miniPreferencesService;
    }

    public Map<String, Object> loadForUser(String userId, String rawPath) {
        String path = PageHelpPathUtil.normalizeForRead(rawPath);
        if (path == null) {
            throw new IllegalArgumentException("路径无效");
        }
        Map<String, Object> data = pageHelpService.loadLatestForUser(path);
        MiniPreferencesVo prefs = miniPreferencesService.load(userId);
        String ackToken = resolveAck(prefs, path);
        @SuppressWarnings("unchecked")
        Map<String, Object> currentVersion = (Map<String, Object>) data.get("currentVersion");
        String bodyHtml = (String) data.get("bodyHtml");
        String versionLabel = PageHelpService.versionLabelFrom(currentVersion);
        data.put("introAckVersionLabel", PageHelpService.isLegacyAckToken(ackToken) ? null : ackToken);
        data.put("introAckUpdatedAt", ackToken);
        data.put("shouldShowIntro", PageHelpService.shouldShowIntro(bodyHtml, versionLabel, ackToken));
        return data;
    }

    public MiniPreferencesVo acknowledgeIntro(String userId, String rawPath, String versionLabel) throws Exception {
        String path = PageHelpPathUtil.normalizeForRead(rawPath);
        if (path == null) {
            throw new IllegalArgumentException("路径无效");
        }
        if (!StringUtils.hasText(versionLabel)) {
            throw new IllegalArgumentException("versionLabel 不能为空");
        }
        String label = versionLabel.trim().toUpperCase();
        if (!label.startsWith("V")) {
            label = "V" + label;
        }
        MiniPreferencesVo existing = miniPreferencesService.load(userId);
        MiniPreferencesVo incoming = new MiniPreferencesVo();
        incoming.setTwinWebChromeTheme(existing.getTwinWebChromeTheme());
        incoming.setAppearanceSchedule(existing.getAppearanceSchedule());
        incoming.setRoomWatch(existing.getRoomWatch());
        Map<String, String> acks = new LinkedHashMap<>();
        if (existing.getPageHelpIntroAck() != null) {
            acks.putAll(existing.getPageHelpIntroAck());
        }
        acks.put(path, label);
        incoming.setPageHelpIntroAck(acks);
        return miniPreferencesService.save(userId, incoming);
    }

    private static String resolveAck(MiniPreferencesVo prefs, String path) {
        if (prefs == null || prefs.getPageHelpIntroAck() == null) {
            return null;
        }
        String v = prefs.getPageHelpIntroAck().get(path);
        return StringUtils.hasText(v) ? v.trim() : null;
    }
}
