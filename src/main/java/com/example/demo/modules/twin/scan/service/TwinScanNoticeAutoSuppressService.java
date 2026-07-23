package com.example.demo.modules.twin.scan.service;

import com.example.demo.modules.twin.dashboard.dto.ScanPopupAnnouncementBundleDTO;
import com.example.demo.modules.twin.dashboard.dto.ScanPopupAnnouncementItemDTO;
import com.example.demo.modules.twin.dashboard.dto.ScanStudentViolationNoticeDTO;
import com.example.demo.modules.twin.dashboard.entity.TwinScanPopupAnnouncement;
import com.example.demo.modules.twin.dashboard.mapper.TwinScanPopupAnnouncementMapper;
import com.example.demo.modules.twin.dashboard.mapper.TwinStudentViolationMapper;
import com.example.demo.modules.twin.dashboard.service.TwinStudentViolationNoticeConfigService;
import com.example.demo.modules.twin.scan.dto.ScanAnalyzeResponseDTO;
import com.example.demo.modules.twin.scan.entity.TwinScanNoticeAutoSuppress;
import com.example.demo.modules.twin.scan.mapper.TwinScanNoticeAutoSuppressMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
public class TwinScanNoticeAutoSuppressService {

    public static final String KIND_VIOLATION = "violation";
    public static final String KIND_UNBOUND = "unbound";
    public static final String KIND_ANNOUNCEMENT = "announcement";

    private final TwinScanNoticeAutoSuppressMapper suppressMapper;
    private final TwinStudentViolationMapper violationMapper;
    private final TwinScanPopupAnnouncementMapper announcementMapper;

    public TwinScanNoticeAutoSuppressService(
            TwinScanNoticeAutoSuppressMapper suppressMapper,
            TwinStudentViolationMapper violationMapper,
            TwinScanPopupAnnouncementMapper announcementMapper
    ) {
        this.suppressMapper = suppressMapper;
        this.violationMapper = violationMapper;
        this.announcementMapper = announcementMapper;
    }

    public void applyAutoOpenSuppressFlags(String targetUserId, ScanAnalyzeResponseDTO result) {
        if (!StringUtils.hasText(targetUserId) || result == null) {
            return;
        }
        List<TwinScanNoticeAutoSuppress> rows = suppressMapper.selectByTargetUserId(targetUserId.trim());
        if (rows == null || rows.isEmpty()) {
            return;
        }
        Map<String, TwinScanNoticeAutoSuppress> byKey = indexByKindRecord(rows);

        ScanStudentViolationNoticeDTO violation = result.getStudentViolationNotice();
        if (violation != null && violation.getId() != null) {
            TwinScanNoticeAutoSuppress sup = byKey.get(suppressKey(KIND_VIOLATION, violation.getId()));
            if (sup != null) {
                violation.setAutoOpenSuppressed(true);
            }
        }
        ScanStudentViolationNoticeDTO unbound = result.getUnboundCardNotice();
        if (unbound != null && unbound.getId() != null) {
            TwinScanNoticeAutoSuppress sup = byKey.get(suppressKey(KIND_UNBOUND, unbound.getId()));
            if (sup != null) {
                unbound.setAutoOpenSuppressed(true);
            }
        }
        ScanPopupAnnouncementBundleDTO bundle = result.getScanPopupAnnouncements();
        if (bundle != null && bundle.getItems() != null) {
            for (ScanPopupAnnouncementItemDTO item : bundle.getItems()) {
                if (item.getId() == null) {
                    continue;
                }
                TwinScanNoticeAutoSuppress sup = byKey.get(suppressKey(KIND_ANNOUNCEMENT, item.getId()));
                if (sup != null) {
                    item.setAutoOpenSuppressed(true);
                }
            }
        }
    }

    public void suppressForScannedUser(String targetUserId, String noticeKindRaw, long recordId) {
        String target = targetUserId != null ? targetUserId.trim() : "";
        if (!StringUtils.hasText(target)) {
            throw new IllegalArgumentException("缺少被扫码人员 userId");
        }
        String noticeKind = normalizeKind(noticeKindRaw);
        if (recordId <= 0) {
            throw new IllegalArgumentException("无效的通告记录 id");
        }
        validateRecordForTarget(target, noticeKind, recordId);

        TwinScanNoticeAutoSuppress row = new TwinScanNoticeAutoSuppress();
        row.setTargetUserId(target);
        row.setNoticeKind(noticeKind);
        row.setRecordId(recordId);
        if (KIND_ANNOUNCEMENT.equals(noticeKind)) {
            TwinScanPopupAnnouncement ann = announcementMapper.selectById(recordId);
            row.setSourceUpdatedAt(ann != null ? ann.getUpdatedAt() : null);
        }
        suppressMapper.upsert(row);
    }

    /** 管理员确认清空：删除该公告全部「不再弹出」记录 */
    public int clearForAnnouncement(long announcementId) {
        if (announcementId <= 0) {
            return 0;
        }
        return suppressMapper.deleteByNoticeKindAndRecordId(KIND_ANNOUNCEMENT, announcementId);
    }

    public int countForAnnouncement(long announcementId) {
        if (announcementId <= 0) {
            return 0;
        }
        return suppressMapper.countByNoticeKindAndRecordId(KIND_ANNOUNCEMENT, announcementId);
    }

    /** 某用户已 suppress 的 kind:recordId 集合（供手机 H5 公告列表标记） */
    public Set<String> suppressKeysForUser(String targetUserId) {
        if (!StringUtils.hasText(targetUserId)) {
            return Set.of();
        }
        List<TwinScanNoticeAutoSuppress> rows = suppressMapper.selectByTargetUserId(targetUserId.trim());
        if (rows == null || rows.isEmpty()) {
            return Set.of();
        }
        Set<String> keys = new LinkedHashSet<>();
        for (TwinScanNoticeAutoSuppress row : rows) {
            if (row.getNoticeKind() == null || row.getRecordId() == null) {
                continue;
            }
            keys.add(suppressKey(row.getNoticeKind(), row.getRecordId()));
        }
        return keys;
    }

    private void validateRecordForTarget(String targetUserId, String noticeKind, long recordId) {
        switch (noticeKind) {
            case KIND_VIOLATION -> {
                var row = violationMapper.selectById(recordId);
                if (row == null) {
                    throw new IllegalArgumentException("违规记录不存在");
                }
                if (row.getTargetUserId() == null || !targetUserId.equals(row.getTargetUserId().trim())) {
                    throw new IllegalArgumentException("违规记录与被扫码人员不匹配");
                }
            }
            case KIND_UNBOUND -> {
                if (recordId != TwinStudentViolationNoticeConfigService.UNBOUND_NOTICE_ID) {
                    throw new IllegalArgumentException("未绑卡通告 id 无效");
                }
            }
            case KIND_ANNOUNCEMENT -> {
                TwinScanPopupAnnouncement ann = announcementMapper.selectById(recordId);
                if (ann == null || !"ACTIVE".equalsIgnoreCase(ann.getStatus())) {
                    throw new IllegalArgumentException("公告不存在或已归档");
                }
            }
            default -> throw new IllegalArgumentException("未知的通告类型");
        }
    }

    private static Map<String, TwinScanNoticeAutoSuppress> indexByKindRecord(List<TwinScanNoticeAutoSuppress> rows) {
        Map<String, TwinScanNoticeAutoSuppress> map = new HashMap<>();
        for (TwinScanNoticeAutoSuppress row : rows) {
            if (row.getNoticeKind() == null || row.getRecordId() == null) {
                continue;
            }
            map.put(suppressKey(row.getNoticeKind(), row.getRecordId()), row);
        }
        return map;
    }

    private static String suppressKey(String kind, long recordId) {
        return kind + ":" + recordId;
    }

    private static String normalizeKind(String raw) {
        if (!StringUtils.hasText(raw)) {
            throw new IllegalArgumentException("缺少通告类型 noticeKind");
        }
        String kind = raw.trim().toLowerCase(Locale.ROOT);
        if (!KIND_VIOLATION.equals(kind) && !KIND_UNBOUND.equals(kind) && !KIND_ANNOUNCEMENT.equals(kind)) {
            throw new IllegalArgumentException("通告类型须为 violation、unbound 或 announcement");
        }
        return kind;
    }
}
