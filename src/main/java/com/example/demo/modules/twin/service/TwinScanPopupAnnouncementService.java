package com.example.demo.modules.twin.service;

import com.example.demo.modules.mp.util.MpHtmlSanitizer;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.twin.dto.ScanPopupAnnouncementBundleDTO;
import com.example.demo.modules.twin.dto.ScanPopupAnnouncementItemDTO;
import com.example.demo.modules.twin.entity.TwinScanPopupAnnouncement;
import com.example.demo.modules.twin.mapper.TwinScanPopupAnnouncementMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

@Service
public class TwinScanPopupAnnouncementService {
    private static final Logger log = LoggerFactory.getLogger(TwinScanPopupAnnouncementService.class);
    private static final String STATUS_ACTIVE = "ACTIVE";
    private static final int SCAN_LIMIT = 30;
    private static final int ADMIN_LIMIT = 200;

    private final TwinScanPopupAnnouncementMapper announcementMapper;
    private final TwinScanPopupAnnouncementConfigService configService;

    private final AtomicBoolean tableAbsent = new AtomicBoolean(false);

    public TwinScanPopupAnnouncementService(
            TwinScanPopupAnnouncementMapper announcementMapper,
            TwinScanPopupAnnouncementConfigService configService
    ) {
        this.announcementMapper = announcementMapper;
        this.configService = configService;
    }

    public ScanPopupAnnouncementBundleDTO buildBundleForScan(User operator, String operatorRoleHint) {
        if (!configService.appliesToOperator(operator, operatorRoleHint)) {
            return null;
        }
        var settings = configService.getSettings();
        if (!settings.isEnabled()) {
            return null;
        }
        List<TwinScanPopupAnnouncement> rows = listActiveRows();
        if (rows.isEmpty()) {
            return null;
        }
        List<ScanPopupAnnouncementItemDTO> items = new ArrayList<>();
        for (TwinScanPopupAnnouncement row : rows) {
            ScanPopupAnnouncementItemDTO item = new ScanPopupAnnouncementItemDTO();
            item.setId(row.getId());
            item.setTitle(row.getTitle());
            item.setContentHtml(row.getContentHtml());
            items.add(item);
        }
        ScanPopupAnnouncementBundleDTO bundle = new ScanPopupAnnouncementBundleDTO();
        bundle.setEnabled(true);
        bundle.setShowNoticeEveryScan(settings.isShowNoticeEveryScan());
        bundle.setTotal(items.size());
        bundle.setItems(items);
        return bundle;
    }

    public List<TwinScanPopupAnnouncement> listForAdmin() {
        if (tableAbsent.get()) {
            return List.of();
        }
        try {
            return announcementMapper.selectAllForAdmin(ADMIN_LIMIT);
        } catch (Exception e) {
            if (isTableMissing(e)) {
                markTableAbsentOnce();
                return List.of();
            }
            throw e;
        }
    }

    public TwinScanPopupAnnouncement getById(long id) {
        if (tableAbsent.get()) {
            return null;
        }
        try {
            return announcementMapper.selectById(id);
        } catch (Exception e) {
            if (isTableMissing(e)) {
                markTableAbsentOnce();
                return null;
            }
            throw e;
        }
    }

    public TwinScanPopupAnnouncement create(
            String title,
            String contentHtml,
            boolean enabled,
            int sortOrder,
            LocalDateTime publishAt,
            LocalDateTime expireAt,
            String operatorId
    ) {
        ensureTableReady();
        TwinScanPopupAnnouncement row = new TwinScanPopupAnnouncement();
        row.setTitle(trimTitle(title));
        row.setContentHtml(MpHtmlSanitizer.sanitizeBodyHtml(contentHtml));
        row.setEnabled(enabled ? 1 : 0);
        row.setSortOrder(sortOrder);
        row.setStatus(STATUS_ACTIVE);
        row.setPublishAt(publishAt);
        row.setExpireAt(expireAt);
        row.setCreatedByUserId(operatorId);
        announcementMapper.insert(row);
        return row;
    }

    public TwinScanPopupAnnouncement update(
            long id,
            String title,
            String contentHtml,
            boolean enabled,
            int sortOrder,
            String status,
            LocalDateTime publishAt,
            LocalDateTime expireAt
    ) {
        ensureTableReady();
        TwinScanPopupAnnouncement existing = announcementMapper.selectById(id);
        if (existing == null) {
            return null;
        }
        TwinScanPopupAnnouncement row = new TwinScanPopupAnnouncement();
        row.setId(id);
        row.setTitle(trimTitle(title));
        row.setContentHtml(MpHtmlSanitizer.sanitizeBodyHtml(contentHtml));
        row.setEnabled(enabled ? 1 : 0);
        row.setSortOrder(sortOrder);
        row.setStatus(StringUtils.hasText(status) ? status.trim().toUpperCase() : STATUS_ACTIVE);
        row.setPublishAt(publishAt);
        row.setExpireAt(expireAt);
        announcementMapper.updateById(row);
        return announcementMapper.selectById(id);
    }

    public boolean delete(long id) {
        ensureTableReady();
        return announcementMapper.deleteById(id) > 0;
    }

    private List<TwinScanPopupAnnouncement> listActiveRows() {
        if (tableAbsent.get()) {
            return List.of();
        }
        try {
            return announcementMapper.selectActiveForScan(SCAN_LIMIT);
        } catch (Exception e) {
            if (isTableMissing(e)) {
                markTableAbsentOnce();
                return List.of();
            }
            log.warn("[scan-announcement] 查询失败: {}", e.getMessage());
            return List.of();
        }
    }

    private static String trimTitle(String title) {
        if (!StringUtils.hasText(title)) {
            return "公告";
        }
        String t = title.trim();
        return t.length() > 200 ? t.substring(0, 200) : t;
    }

    private void ensureTableReady() {
        if (tableAbsent.get()) {
            throw new IllegalStateException("库表 twin_scan_popup_announcement 未创建，请执行 scripts/twin_scan_popup_announcement.ddl.sql 或开启 app.schema.auto-ensure-embedded-core-ddl");
        }
    }

    private static boolean isTableMissing(Throwable e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            String m = t.getMessage();
            if (m != null && m.contains("twin_scan_popup_announcement") && m.contains("doesn't exist")) {
                return true;
            }
        }
        return false;
    }

    private void markTableAbsentOnce() {
        if (tableAbsent.compareAndSet(false, true)) {
            log.warn("[scan-announcement] 库表 twin_scan_popup_announcement 不存在，已跳过公告读写。请执行 DDL 后重启。");
        }
    }
}
