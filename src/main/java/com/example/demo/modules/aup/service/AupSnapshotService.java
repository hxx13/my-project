package com.example.demo.modules.aup.service;

import com.example.demo.modules.aup.entity.AupRecord;
import com.example.demo.modules.aup.entity.AupSnapshot;
import com.example.demo.modules.aup.mapper.AupSnapshotMapper;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 快照保存/查询。快照不可变，只 insert/select。
 */
@Service
public class AupSnapshotService {

    private final AupSnapshotMapper snapshotMapper;

    public AupSnapshotService(AupSnapshotMapper snapshotMapper) {
        this.snapshotMapper = snapshotMapper;
    }

    /** 下一个快照序号（全计划单调递增） */
    public int nextVersionNo(Long aupId) {
        Integer max = snapshotMapper.selectMaxVersionNo(aupId);
        return (max == null ? 0 : max) + 1;
    }

    /** 保存一个不可变快照 */
    public AupSnapshot createSnapshot(AupRecord record, String stage, String draftSource, String data, String operatorId) {
        AupSnapshot snap = new AupSnapshot();
        snap.setAupId(record.getId());
        snap.setVersionNo(nextVersionNo(record.getId()));
        snap.setStage(stage);
        snap.setDraftSource(draftSource);
        snap.setData(data);
        snap.setTemplateId(record.getTemplateId());
        snap.setTemplateVersion(record.getTemplateVersion());
        snap.setCreatedBy(operatorId);
        snapshotMapper.insert(snap);
        return snap;
    }

    /** 轻量快照列表（不返 data） */
    public List<AupSnapshot> listLight(Long aupId) {
        return snapshotMapper.selectLightByAupId(aupId);
    }

    public AupSnapshot get(Long aupId, Long snapshotId) {
        return snapshotMapper.selectByIdAndAupId(snapshotId, aupId);
    }

    public int count(Long aupId) {
        return snapshotMapper.countByAupId(aupId);
    }
}
