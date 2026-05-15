package com.example.demo.modules.mp.service;

import com.example.demo.modules.mp.dto.MpHomeBulletinDetailDto;
import com.example.demo.modules.mp.dto.MpHomeBulletinListItemDto;
import com.example.demo.modules.mp.entity.MiniProgramAnnouncement;
import com.example.demo.modules.mp.entity.MiniProgramRelease;
import com.example.demo.modules.mp.mapper.MiniProgramAnnouncementMapper;
import com.example.demo.modules.mp.mapper.MiniProgramReleaseMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
public class MpHomeBulletinPublicService {

    private static final Logger log = LoggerFactory.getLogger(MpHomeBulletinPublicService.class);
    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private final MiniProgramAnnouncementMapper announcementMapper;
    private final MiniProgramReleaseMapper releaseMapper;

    public MpHomeBulletinPublicService(MiniProgramAnnouncementMapper announcementMapper,
                                       MiniProgramReleaseMapper releaseMapper) {
        this.announcementMapper = announcementMapper;
        this.releaseMapper = releaseMapper;
    }

    public List<MpHomeBulletinListItemDto> listMerged() {
        List<MpHomeBulletinListItemDto> out = new ArrayList<>();
        try {
            for (MiniProgramAnnouncement a : announcementMapper.selectPublishedEnabled()) {
                out.add(fromAnnouncement(a));
            }
        } catch (DataAccessException ex) {
            log.debug("[mp-bulletin] announcements skipped: {}", ex.getMostSpecificCause().getMessage());
        }
        try {
            for (MiniProgramRelease r : releaseMapper.selectAllPublished()) {
                out.add(fromRelease(r));
            }
        } catch (DataAccessException ex) {
            log.debug("[mp-bulletin] releases skipped: {}", ex.getMostSpecificCause().getMessage());
        }
        out.sort(Comparator.comparing(MpHomeBulletinPublicService::parsePublished, Comparator.nullsLast(Comparator.reverseOrder())));
        return out;
    }

    public MpHomeBulletinDetailDto detail(String id, String kind) {
        if (!StringUtils.hasText(id) || !StringUtils.hasText(kind)) {
            return null;
        }
        String k = kind.trim().toLowerCase();
        if ("announcement".equals(k)) {
            MiniProgramAnnouncement a = announcementMapper.selectById(id.trim());
            if (a == null || a.getEnabled() == null || a.getEnabled() != 1) {
                return null;
            }
            return toDetailAnnouncement(a);
        }
        if ("release".equals(k)) {
            MiniProgramRelease r = releaseMapper.selectById(id.trim());
            if (r == null) {
                return null;
            }
            return toDetailRelease(r);
        }
        return null;
    }

    private static LocalDateTime parsePublished(MpHomeBulletinListItemDto d) {
        if (d == null || !StringUtils.hasText(d.getPublishedAtText())) {
            return null;
        }
        try {
            return LocalDateTime.parse(d.getPublishedAtText(), TS);
        } catch (Exception ignored) {
            return null;
        }
    }

    private MpHomeBulletinListItemDto fromAnnouncement(MiniProgramAnnouncement a) {
        MpHomeBulletinListItemDto d = new MpHomeBulletinListItemDto();
        d.setId(a.getId());
        d.setKind("announcement");
        d.setTitle(a.getTitle());
        d.setSummary(a.getSummary());
        if (a.getPublishedAt() != null) {
            d.setPublishedAtText(a.getPublishedAt().format(TS));
        }
        return d;
    }

    private MpHomeBulletinListItemDto fromRelease(MiniProgramRelease r) {
        MpHomeBulletinListItemDto d = new MpHomeBulletinListItemDto();
        d.setId(r.getId());
        d.setKind("release");
        d.setTitle(r.getTitle());
        d.setSummary(r.getSummary());
        d.setVersionCode(r.getVersionCode());
        if (r.getPublishedAt() != null) {
            d.setPublishedAtText(r.getPublishedAt().format(TS));
        }
        return d;
    }

    private MpHomeBulletinDetailDto toDetailAnnouncement(MiniProgramAnnouncement a) {
        MpHomeBulletinDetailDto d = new MpHomeBulletinDetailDto();
        d.setId(a.getId());
        d.setKind("announcement");
        d.setTitle(a.getTitle());
        d.setBodyHtml(a.getBodyHtml());
        if (a.getPublishedAt() != null) {
            d.setPublishedAtText(a.getPublishedAt().format(TS));
        }
        return d;
    }

    private MpHomeBulletinDetailDto toDetailRelease(MiniProgramRelease r) {
        MpHomeBulletinDetailDto d = new MpHomeBulletinDetailDto();
        d.setId(r.getId());
        d.setKind("release");
        d.setTitle(r.getTitle());
        d.setBodyHtml(r.getBodyHtml());
        d.setVersionCode(r.getVersionCode());
        if (r.getPublishedAt() != null) {
            d.setPublishedAtText(r.getPublishedAt().format(TS));
        }
        return d;
    }
}
