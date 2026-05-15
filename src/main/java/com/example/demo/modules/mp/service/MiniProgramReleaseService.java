package com.example.demo.modules.mp.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.mp.dto.MiniProgramReleaseUpsertRequest;
import com.example.demo.modules.mp.dto.MiniProgramReleaseView;
import com.example.demo.modules.mp.entity.MiniProgramRelease;
import com.example.demo.modules.mp.mapper.MiniProgramReleaseMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class MiniProgramReleaseService {

    private static final Logger log = LoggerFactory.getLogger(MiniProgramReleaseService.class);

    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private final MiniProgramReleaseMapper mapper;

    public MiniProgramReleaseService(MiniProgramReleaseMapper mapper) {
        this.mapper = mapper;
    }

    public MiniProgramReleaseView findSplashView() {
        try {
            MiniProgramRelease row = mapper.selectSplash();
            return row == null ? null : toView(row);
        } catch (DataAccessException ex) {
            log.debug("[mp-release] read splash skipped: {}", ex.getMostSpecificCause().getMessage());
            return null;
        }
    }

    public List<MiniProgramReleaseView> listPublishedViews() {
        try {
            return mapper.selectAllPublished().stream().map(this::toView).collect(Collectors.toList());
        } catch (DataAccessException ex) {
            log.debug("[mp-release] list published skipped: {}", ex.getMostSpecificCause().getMessage());
            return List.of();
        }
    }

    public MiniProgramReleaseView create(User operator, MiniProgramReleaseUpsertRequest req) {
        requireOwner(operator);
        validateReq(req);
        if (Boolean.TRUE.equals(req.getShowOnLaunch())) {
            mapper.clearShowOnLaunch();
        }
        MiniProgramRelease row = new MiniProgramRelease();
        row.setId("REL_" + UUID.randomUUID().toString().replace("-", ""));
        row.setVersionCode(req.getVersionCode().trim());
        row.setTitle(req.getTitle().trim());
        row.setSummary(trimToNull(req.getSummary()));
        row.setBodyHtml(req.getBodyHtml() != null ? req.getBodyHtml() : "");
        row.setPublishedAt(LocalDateTime.now());
        row.setShowOnLaunch(Boolean.TRUE.equals(req.getShowOnLaunch()) ? 1 : 0);
        row.setCreatedBy(operator.getId());
        mapper.insert(row);
        return toView(mapper.selectById(row.getId()));
    }

    public MiniProgramReleaseView update(User operator, String id, MiniProgramReleaseUpsertRequest req) {
        requireOwner(operator);
        if (!StringUtils.hasText(id)) {
            throw new IllegalArgumentException("id 不能为空");
        }
        MiniProgramRelease existing = mapper.selectById(id.trim());
        if (existing == null) {
            throw new IllegalArgumentException("记录不存在");
        }
        validateReq(req);
        if (Boolean.TRUE.equals(req.getShowOnLaunch())) {
            mapper.clearShowOnLaunch();
        }
        existing.setVersionCode(req.getVersionCode().trim());
        existing.setTitle(req.getTitle().trim());
        existing.setSummary(trimToNull(req.getSummary()));
        existing.setBodyHtml(req.getBodyHtml() != null ? req.getBodyHtml() : "");
        existing.setShowOnLaunch(Boolean.TRUE.equals(req.getShowOnLaunch()) ? 1 : 0);
        mapper.update(existing);
        return toView(mapper.selectById(id.trim()));
    }

    public void delete(User operator, String id) {
        requireOwner(operator);
        if (!StringUtils.hasText(id)) {
            throw new IllegalArgumentException("id 不能为空");
        }
        mapper.deleteById(id.trim());
    }

    private void requireOwner(User operator) {
        if (operator == null || operator.getRole() != RoleEnum.PLATFORM_OWNER) {
            throw new IllegalArgumentException("仅平台所有者可维护版本公告");
        }
    }

    private void validateReq(MiniProgramReleaseUpsertRequest req) {
        if (req == null) {
            throw new IllegalArgumentException("请求体不能为空");
        }
        if (!StringUtils.hasText(req.getVersionCode())) {
            throw new IllegalArgumentException("版本号不能为空");
        }
        if (!StringUtils.hasText(req.getTitle())) {
            throw new IllegalArgumentException("标题不能为空");
        }
    }

    private static String trimToNull(String s) {
        if (!StringUtils.hasText(s)) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    private MiniProgramReleaseView toView(MiniProgramRelease row) {
        if (row == null) {
            return null;
        }
        MiniProgramReleaseView v = new MiniProgramReleaseView();
        v.setId(row.getId());
        v.setVersionCode(row.getVersionCode());
        v.setTitle(row.getTitle());
        v.setSummary(row.getSummary());
        v.setBodyHtml(row.getBodyHtml());
        if (row.getPublishedAt() != null) {
            v.setPublishedAtText(row.getPublishedAt().format(TS));
        }
        v.setShowOnLaunch(row.getShowOnLaunch());
        return v;
    }
}
