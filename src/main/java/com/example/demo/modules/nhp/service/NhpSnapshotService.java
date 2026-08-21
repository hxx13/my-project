package com.example.demo.modules.nhp.service;

import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.nhp.entity.CrfRecord;
import com.example.demo.modules.nhp.entity.CrfRecordSnapshot;
import com.example.demo.modules.nhp.mapper.CrfRecordSnapshotMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/** NHP CRF 快照：不可变 insert/select。 */
@Service
public class NhpSnapshotService {

    private final CrfRecordSnapshotMapper snapshotMapper;
    private final UserDisplayNameService userDisplayNameService;

    public NhpSnapshotService(CrfRecordSnapshotMapper snapshotMapper,
                              UserDisplayNameService userDisplayNameService) {
        this.snapshotMapper = snapshotMapper;
        this.userDisplayNameService = userDisplayNameService;
    }

    public int nextVersionNo(Long recordId) {
        Integer max = snapshotMapper.selectMaxVersionNo(recordId);
        return (max == null ? 0 : max) + 1;
    }

    public CrfRecordSnapshot create(CrfRecord record, String dataJson, String bizStage, String note, String operatorId) {
        CrfRecordSnapshot snap = new CrfRecordSnapshot();
        snap.setRecordId(record.getId());
        snap.setVersionNo(nextVersionNo(record.getId()));
        snap.setStage(record.getStatus() == null ? "DRAFT" : record.getStatus());
        snap.setBizStage(bizStage);
        snap.setDataJson(dataJson == null ? "{}" : dataJson);
        snap.setFormId(record.getFormId());
        snap.setNote(note);
        snap.setCreatedBy(operatorId);
        snapshotMapper.insert(snap);
        enrichCreatedByNames(List.of(snap));
        return snap;
    }

    public List<CrfRecordSnapshot> listLight(Long recordId) {
        List<CrfRecordSnapshot> list = snapshotMapper.listLightByRecordId(recordId);
        enrichCreatedByNames(list);
        return list;
    }

    public CrfRecordSnapshot get(Long recordId, Long snapshotId) {
        CrfRecordSnapshot snap = snapshotMapper.findByIdAndRecordId(snapshotId, recordId);
        if (snap != null) {
            enrichCreatedByNames(List.of(snap));
        }
        return snap;
    }

    public int count(Long recordId) {
        return snapshotMapper.countByRecordId(recordId);
    }

    private void enrichCreatedByNames(List<CrfRecordSnapshot> rows) {
        if (rows == null || rows.isEmpty()) {
            return;
        }
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        for (CrfRecordSnapshot r : rows) {
            if (r != null && StringUtils.hasText(r.getCreatedBy())) {
                ids.add(r.getCreatedBy().trim());
            }
        }
        if (ids.isEmpty()) {
            return;
        }
        Map<String, String> names = userDisplayNameService.resolveDisplayNames(new ArrayList<>(ids));
        for (CrfRecordSnapshot r : rows) {
            if (r == null || !StringUtils.hasText(r.getCreatedBy())) {
                continue;
            }
            String id = r.getCreatedBy().trim();
            String n = names.get(id);
            r.setCreatedByName(StringUtils.hasText(n) ? n : id);
        }
    }
}
