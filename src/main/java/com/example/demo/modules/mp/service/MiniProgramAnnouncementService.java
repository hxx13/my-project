package com.example.demo.modules.mp.service;

import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.mp.dto.MpAnnouncementAdminView;
import com.example.demo.modules.mp.dto.MpAnnouncementUpsertRequest;
import com.example.demo.modules.mp.entity.MiniProgramAnnouncement;
import com.example.demo.modules.mp.mapper.MiniProgramAnnouncementMapper;
import com.example.demo.modules.mp.util.MpHtmlSanitizer;
import com.example.demo.modules.twin.obligation.content.ContentJsonSupport;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class MiniProgramAnnouncementService {

    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private final MiniProgramAnnouncementMapper mapper;
    private final ObjectMapper objectMapper;
    private final UserDisplayNameService userDisplayNameService;

    public MiniProgramAnnouncementService(MiniProgramAnnouncementMapper mapper,
                                          ObjectMapper objectMapper,
                                          UserDisplayNameService userDisplayNameService) {
        this.mapper = mapper;
        this.objectMapper = objectMapper;
        this.userDisplayNameService = userDisplayNameService;
    }

    public List<MpAnnouncementAdminView> listAdmin() {
        try {
            List<MiniProgramAnnouncement> rows = mapper.selectAllForAdmin();
            LinkedHashSet<String> ids = new LinkedHashSet<>();
            for (MiniProgramAnnouncement row : rows) {
                if (row != null && StringUtils.hasText(row.getCreatedBy())) {
                    ids.add(row.getCreatedBy().trim());
                }
            }
            Map<String, String> names = userDisplayNameService.resolveDisplayNames(ids);
            List<MpAnnouncementAdminView> out = new ArrayList<>(rows.size());
            for (MiniProgramAnnouncement row : rows) {
                out.add(toAdminView(row, names));
            }
            return out;
        } catch (DataAccessException ex) {
            return List.of();
        }
    }

    public MpAnnouncementAdminView getAdmin(String id) {
        if (!StringUtils.hasText(id)) {
            return null;
        }
        MiniProgramAnnouncement row = mapper.selectById(id.trim());
        return row == null ? null : toAdminView(row, null);
    }

    public MpAnnouncementAdminView create(User operator, MpAnnouncementUpsertRequest req) {
        validate(req);
        ContentJsonSupport.Resolved resolved = ContentJsonSupport.resolve(
                objectMapper, req.getContentJson(), req.getBodyHtml(), true);
        MiniProgramAnnouncement row = new MiniProgramAnnouncement();
        row.setId("ANN_" + UUID.randomUUID().toString().replace("-", ""));
        row.setTitle(req.getTitle().trim());
        row.setSummary(trimToNull(sanitizeSummary(req.getSummary())));
        row.setBodyHtml(resolved.contentHtml());
        row.setContentJson(resolved.contentJson());
        row.setPublishedAt(LocalDateTime.now());
        row.setEnabled(req.getEnabled() != null && req.getEnabled() == 0 ? 0 : 1);
        row.setSortOrder(req.getSortOrder() != null ? req.getSortOrder() : 0);
        row.setCreatedBy(operator != null ? operator.getId() : null);
        mapper.insert(row);
        return toAdminView(mapper.selectById(row.getId()), null);
    }

    public MpAnnouncementAdminView update(String id, MpAnnouncementUpsertRequest req) {
        if (!StringUtils.hasText(id)) {
            throw new IllegalArgumentException("id 不能为空");
        }
        MiniProgramAnnouncement existing = mapper.selectById(id.trim());
        if (existing == null) {
            throw new IllegalArgumentException("记录不存在");
        }
        validate(req);
        ContentJsonSupport.Resolved resolved = ContentJsonSupport.resolve(
                objectMapper, req.getContentJson(), req.getBodyHtml(), true);
        existing.setTitle(req.getTitle().trim());
        existing.setSummary(trimToNull(sanitizeSummary(req.getSummary())));
        existing.setBodyHtml(resolved.contentHtml());
        existing.setContentJson(resolved.contentJson());
        existing.setEnabled(req.getEnabled() != null && req.getEnabled() == 0 ? 0 : 1);
        existing.setSortOrder(req.getSortOrder() != null ? req.getSortOrder() : 0);
        mapper.update(existing);
        return toAdminView(mapper.selectById(id.trim()), null);
    }

    public void delete(String id) {
        if (!StringUtils.hasText(id)) {
            throw new IllegalArgumentException("id 不能为空");
        }
        mapper.deleteById(id.trim());
    }

    private void validate(MpAnnouncementUpsertRequest req) {
        if (req == null) {
            throw new IllegalArgumentException("请求体不能为空");
        }
        if (!StringUtils.hasText(req.getTitle())) {
            throw new IllegalArgumentException("标题不能为空");
        }
    }

    private static String sanitizeSummary(String summary) {
        if (!StringUtils.hasText(summary)) {
            return null;
        }
        return MpHtmlSanitizer.sanitizeBodyHtml(summary);
    }

    private static String trimToNull(String s) {
        if (!StringUtils.hasText(s)) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    private MpAnnouncementAdminView toAdminView(MiniProgramAnnouncement row, Map<String, String> nameMap) {
        if (row == null) {
            return null;
        }
        MpAnnouncementAdminView v = new MpAnnouncementAdminView();
        v.setId(row.getId());
        v.setTitle(row.getTitle());
        v.setSummary(row.getSummary());
        v.setBodyHtml(row.getBodyHtml());
        v.setContentJson(row.getContentJson());
        if (row.getPublishedAt() != null) {
            v.setPublishedAtText(row.getPublishedAt().format(TS));
        }
        v.setEnabled(row.getEnabled());
        v.setSortOrder(row.getSortOrder());
        v.setCreatedBy(row.getCreatedBy());
        String cid = row.getCreatedBy() == null ? "" : row.getCreatedBy().trim();
        String n = nameMap != null ? nameMap.get(cid) : null;
        if (!StringUtils.hasText(n) && StringUtils.hasText(cid)) {
            n = userDisplayNameService.resolveDisplayName(cid);
        }
        v.setCreatedByName(StringUtils.hasText(n) ? n : cid);
        return v;
    }
}
