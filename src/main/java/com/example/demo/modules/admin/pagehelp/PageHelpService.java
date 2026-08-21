package com.example.demo.modules.admin.pagehelp;

import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.mp.util.MpHtmlSanitizer;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

@Service
public class PageHelpService {

    private static final Pattern VERSION_LABEL = Pattern.compile("^V\\d+\\.\\d+\\.\\d+$", Pattern.CASE_INSENSITIVE);

    private final AdminPageHelpRepository repository;
    private final UserDisplayNameService userDisplayNameService;

    public PageHelpService(AdminPageHelpRepository repository,
                           UserDisplayNameService userDisplayNameService) {
        this.repository = repository;
        this.userDisplayNameService = userDisplayNameService;
    }

    public Map<String, Object> loadBundleForAdmin(String pagePath) {
        ensureLegacyMigrated(pagePath);
        Map<String, Object> data = new HashMap<>();
        Optional<Map<String, Object>> latest = repository.findLatestVersion(pagePath);
        if (latest.isPresent()) {
            Map<String, Object> v = latest.get();
            data.put("bodyHtml", v.get("bodyHtml"));
            data.put("updatedAt", v.get("createdAt"));
            data.put("updatedBy", v.get("createdBy"));
            data.put("updatedByName", resolvePersonName(v.get("createdBy")));
            data.put("currentVersion", enrichVersion(v));
        } else {
            data.put("bodyHtml", null);
            data.put("updatedAt", null);
            data.put("updatedBy", null);
            data.put("updatedByName", null);
            data.put("currentVersion", null);
        }
        data.put("versions", enrichVersions(repository.listVersions(pagePath)));
        data.put("messages", enrichMessages(repository.listMessages(pagePath)));
        return data;
    }

    public Map<String, Object> loadLatestForUser(String pagePath) {
        ensureLegacyMigrated(pagePath);
        Map<String, Object> data = new HashMap<>();
        data.put("path", pagePath);
        Optional<Map<String, Object>> latest = repository.findLatestVersion(pagePath);
        if (latest.isEmpty()) {
            data.put("bodyHtml", null);
            data.put("updatedAt", null);
            data.put("currentVersion", null);
            return data;
        }
        Map<String, Object> v = latest.get();
        data.put("bodyHtml", v.get("bodyHtml"));
        data.put("updatedAt", v.get("createdAt"));
        data.put("currentVersion", v);
        return data;
    }

    public Map<String, Object> publishVersion(String pagePath, String versionLabel, String versionKind, String bodyHtml, String userId) {
        String label = normalizeVersionLabel(versionLabel);
        if (label == null) {
            throw new IllegalArgumentException("版本号格式须为 Vx.y.z，例如 V1.0.1");
        }
        String kind = normalizeVersionKind(versionKind);
        String safe = MpHtmlSanitizer.sanitizeBodyHtml(bodyHtml == null ? "" : bodyHtml);
        if (!StringUtils.hasText(safe)) {
            throw new IllegalArgumentException("正文不能为空");
        }
        if (repository.existsVersionLabel(pagePath, label)) {
            throw new IllegalArgumentException("版本号 " + label + " 已存在，请递增版本号");
        }
        long id = repository.insertVersion(pagePath, label, kind, safe, userId);
        repository.syncLegacyHelpRow(pagePath, safe, userId);
        Map<String, Object> out = new HashMap<>();
        out.put("id", id);
        out.put("versionLabel", label);
        out.put("versionKind", kind);
        return out;
    }

    public void updateVersion(String pagePath, long versionId, String versionKind, String bodyHtml, String userId) {
        if (versionId <= 0) {
            throw new IllegalArgumentException("版本 id 无效");
        }
        if (repository.findVersionById(pagePath, versionId).isEmpty()) {
            throw new IllegalArgumentException("版本不存在");
        }
        String kind = normalizeVersionKind(versionKind);
        String safe = MpHtmlSanitizer.sanitizeBodyHtml(bodyHtml == null ? "" : bodyHtml);
        if (!StringUtils.hasText(safe)) {
            throw new IllegalArgumentException("正文不能为空");
        }
        int n = repository.updateVersion(versionId, pagePath, kind, safe);
        if (n <= 0) {
            throw new IllegalArgumentException("更新失败");
        }
        syncLegacyIfLatest(pagePath, versionId, safe, userId);
    }

    public void deleteVersion(String pagePath, long versionId, String userId) {
        if (versionId <= 0) {
            throw new IllegalArgumentException("版本 id 无效");
        }
        Optional<Map<String, Object>> target = repository.findVersionById(pagePath, versionId);
        if (target.isEmpty()) {
            throw new IllegalArgumentException("版本不存在");
        }
        boolean wasLatest = repository.findLatestVersion(pagePath)
                .map(v -> versionId == ((Number) v.get("id")).longValue())
                .orElse(false);
        int n = repository.deleteVersion(versionId, pagePath);
        if (n <= 0) {
            throw new IllegalArgumentException("删除失败");
        }
        if (wasLatest) {
            Optional<Map<String, Object>> latest = repository.findLatestVersion(pagePath);
            if (latest.isPresent()) {
                String html = (String) latest.get().get("bodyHtml");
                repository.syncLegacyHelpRow(pagePath, html, userId);
            } else {
                repository.clearLegacyHelpRow(pagePath);
            }
        }
    }

    private void syncLegacyIfLatest(String pagePath, long versionId, String bodyHtml, String userId) {
        repository.findLatestVersion(pagePath).ifPresent(latest -> {
            long latestId = ((Number) latest.get("id")).longValue();
            if (latestId == versionId) {
                repository.syncLegacyHelpRow(pagePath, bodyHtml, userId);
            }
        });
    }

    public static boolean shouldShowIntro(String bodyHtml, String currentVersionLabel, String ackToken) {
        if (!StringUtils.hasText(bodyHtml)) {
            return false;
        }
        if (!StringUtils.hasText(currentVersionLabel)) {
            return true;
        }
        if (!StringUtils.hasText(ackToken)) {
            return true;
        }
        String ack = ackToken.trim();
        if (isLegacyAckToken(ack)) {
            return true;
        }
        return !currentVersionLabel.equalsIgnoreCase(ack);
    }

    public static boolean isLegacyAckToken(String ack) {
        if (ack == null || ack.isBlank()) {
            return false;
        }
        return ack.contains("-") && ack.contains(":") || ack.matches("\\d{4}-\\d{2}-.*");
    }

    public static String versionLabelFrom(Map<String, Object> version) {
        if (version == null) {
            return null;
        }
        Object label = version.get("versionLabel");
        return label == null ? null : String.valueOf(label).trim();
    }

    private void ensureLegacyMigrated(String pagePath) {
        if (repository.countVersions(pagePath) > 0) {
            return;
        }
        Optional<Map<String, Object>> legacy = repository.findLegacyHelpRow(pagePath);
        if (legacy.isEmpty()) {
            return;
        }
        String html = (String) legacy.get().get("bodyHtml");
        if (!StringUtils.hasText(html)) {
            return;
        }
        String by = legacy.get().get("updatedBy") == null ? "system" : String.valueOf(legacy.get().get("updatedBy"));
        if (!repository.existsVersionLabel(pagePath, "V1.0.0")) {
            repository.insertVersion(pagePath, "V1.0.0", "update", html, by);
        }
    }

    private static String normalizeVersionLabel(String raw) {
        if (raw == null) {
            return null;
        }
        String t = raw.trim().toUpperCase();
        if (!t.startsWith("V")) {
            t = "V" + t;
        }
        if (!VERSION_LABEL.matcher(t).matches()) {
            return null;
        }
        return t;
    }

    private static String normalizeVersionKind(String raw) {
        if (raw == null) {
            return "update";
        }
        String k = raw.trim().toLowerCase();
        if ("new".equals(k) || "major".equals(k)) {
            return "new";
        }
        return "update";
    }

    private String resolvePersonName(Object userIdObj) {
        if (userIdObj == null) {
            return null;
        }
        String id = String.valueOf(userIdObj).trim();
        if (!StringUtils.hasText(id)) {
            return null;
        }
        String n = userDisplayNameService.resolveDisplayName(id);
        return StringUtils.hasText(n) ? n : id;
    }

    private Map<String, Object> enrichVersion(Map<String, Object> v) {
        if (v == null) {
            return null;
        }
        Map<String, Object> m = new HashMap<>(v);
        Object by = v.get("createdBy");
        m.put("createdByName", resolvePersonName(by));
        return m;
    }

    private List<Map<String, Object>> enrichVersions(List<Map<String, Object>> versions) {
        if (versions == null || versions.isEmpty()) {
            return versions == null ? List.of() : versions;
        }
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        for (Map<String, Object> v : versions) {
            Object by = v.get("createdBy");
            if (by != null && StringUtils.hasText(String.valueOf(by))) {
                ids.add(String.valueOf(by).trim());
            }
        }
        Map<String, String> names = userDisplayNameService.resolveDisplayNames(ids);
        List<Map<String, Object>> out = new ArrayList<>(versions.size());
        for (Map<String, Object> v : versions) {
            Map<String, Object> m = new HashMap<>(v);
            Object by = v.get("createdBy");
            String id = by == null ? "" : String.valueOf(by).trim();
            String n = names.get(id);
            m.put("createdByName", StringUtils.hasText(n) ? n : (StringUtils.hasText(id) ? id : null));
            out.add(m);
        }
        return out;
    }

    private List<Map<String, Object>> enrichMessages(List<Map<String, Object>> messages) {
        if (messages == null || messages.isEmpty()) {
            return messages == null ? List.of() : messages;
        }
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        for (Map<String, Object> msg : messages) {
            Object uid = msg.get("userId");
            if (uid != null && StringUtils.hasText(String.valueOf(uid))) {
                ids.add(String.valueOf(uid).trim());
            }
        }
        Map<String, String> names = userDisplayNameService.resolveDisplayNames(ids);
        List<Map<String, Object>> out = new ArrayList<>(messages.size());
        for (Map<String, Object> msg : messages) {
            Map<String, Object> m = new HashMap<>(msg);
            Object uid = msg.get("userId");
            String id = uid == null ? "" : String.valueOf(uid).trim();
            String n = names.get(id);
            if (StringUtils.hasText(n)) {
                m.put("authorLabel", n);
            }
            out.add(m);
        }
        return out;
    }
}
