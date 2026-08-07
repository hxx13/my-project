package com.example.demo.modules.cageshelf.service;

import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.cageshelf.entity.ApprovalRecord;
import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.cageshelf.entity.CageCellDetail;
import com.example.demo.modules.cageshelf.entity.CageCellHistory;
import com.example.demo.modules.cageshelf.entity.CageClaim;
import com.example.demo.modules.cageshelf.mapper.ApprovalRecordMapper;
import com.example.demo.modules.cageshelf.mapper.CageCellDetailMapper;
import com.example.demo.modules.cageshelf.mapper.CageCellHistoryMapper;
import com.example.demo.modules.cageshelf.mapper.CageClaimMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * 笼位详情本地业务服务 — 封装所有本地写操作。
 * Controller 只做路由和入队，业务逻辑集中在这里。
 */
@Service
public class CageCellDetailService {

    private static final Logger log = LoggerFactory.getLogger(CageCellDetailService.class);
    private final CageCellDetailMapper detailMapper;
    private final CageClaimMapper claimMapper;
    private final ApprovalRecordMapper approvalMapper;
    private final CageCellHistoryMapper historyMapper;
    private final AroPersonnelMapper aroPersonnelMapper;

    public CageCellDetailService(CageCellDetailMapper detailMapper,
                                  CageClaimMapper claimMapper,
                                  ApprovalRecordMapper approvalMapper,
                                  CageCellHistoryMapper historyMapper,
                                  AroPersonnelMapper aroPersonnelMapper) {
        this.detailMapper = detailMapper;
        this.claimMapper = claimMapper;
        this.approvalMapper = approvalMapper;
        this.historyMapper = historyMapper;
        this.aroPersonnelMapper = aroPersonnelMapper;
    }

    /** 绑定笼盒 */
    public CageCellDetail bindCageBox(Long animalCageId, String cageBoxCode) {
        CageCellDetail d = getOrCreate(animalCageId);
        d.setHasCageBox(true);
        d.setCageBoxCode(cageBoxCode);
        d.setCageTypeCode(3); // 已预约(饲养中)
        detailMapper.batchUpsert(List.of(d));
        log.info("[local] BIND animalCageId={} cageBoxCode={}", animalCageId, cageBoxCode);
        return d;
    }

    /** 解绑笼盒 — 清空特殊状态，变为空笼盒 */
    public CageCellDetail unbindCageBox(Long animalCageId) {
        CageCellDetail d = getOrCreate(animalCageId);
        d.setHasCageBox(false);
        d.setCageBoxCode(null);
        d.setCageTypeCode(2); // 已预约(空笼盒)
        clearSpecialStatuses(d);
        detailMapper.batchUpsert(List.of(d));
        log.info("[local] UNBIND animalCageId={}", animalCageId);
        return d;
    }

    /** 分配笼位 */
    public CageCellDetail allocate(Long animalCageId) {
        return allocate(animalCageId, null, null);
    }

    /** 分配笼位 — 带课题组信息 */
    public CageCellDetail allocate(Long animalCageId, String piName, String aupNumber) {
        CageCellDetail d = getOrCreate(animalCageId);
        d.setCageTypeCode(2); // 已预约(空笼盒)
        if (piName != null && !piName.isBlank()) {
            d.setProjectPiName(piName);
            // 从 personnel 库查询 PI 所属院系
            try {
                AroPersonnel p = aroPersonnelMapper.findByName(piName);
                if (p != null && p.getDepartmentName() != null && !p.getDepartmentName().isBlank()) {
                    d.setDepartmentName(p.getDepartmentName());
                }
            } catch (Exception e) {
                log.warn("[local] ALLOCATE 查询PI院系失败 piName={}: {}", piName, e.getMessage());
            }
        }
        if (aupNumber != null && !aupNumber.isBlank()) {
            d.setAupNumber(aupNumber);
        }
        detailMapper.batchUpsert(List.of(d));
        log.info("[local] ALLOCATE animalCageId={} piName={} aup={}", animalCageId, piName, aupNumber);
        return d;
    }

    /** 取消分配 — 同时检查并清理活跃认领 */
    public CageCellDetail cancelAllocate(Long animalCageId) {
        // 检查活跃认领
        List<CageClaim> claims = claimMapper.selectByAnimalCageIdForUpdate(animalCageId);
        for (CageClaim claim : claims) {
            if (claim.isActive()) {
                claim.setClaimStatus("released");
                claim.setNote("AUP分配取消，系统自动释放");
                claimMapper.update(claim);
                // 写审计记录
                ApprovalRecord ar = new ApprovalRecord();
                ar.setTargetType("cage_release");
                ar.setTargetId(claim.getId());
                ar.setApproverId("0");
                ar.setApproverName("SYSTEM");
                ar.setApproverRole("SYSTEM");
                ar.setDecision("released");
                ar.setRejectReason("AUP分配取消触发自动释放 animalCageId=" + animalCageId);
                approvalMapper.insert(ar);
                log.warn("[local] CANCEL_ALLOCATE 自动释放认领 claimId={} animalCageId={}", claim.getId(), animalCageId);
            }
        }

        CageCellDetail d = getOrCreate(animalCageId);
        d.setCageTypeCode(1); // 等待分配
        d.setHasCageBox(false);
        d.setCageBoxCode(null);
        clearSpecialStatuses(d);
        detailMapper.batchUpsert(List.of(d));
        log.info("[local] CANCEL_ALLOCATE animalCageId={}", animalCageId);
        return d;
    }

    /** 切换特殊状态标记（无操作人，用于非交互路径） */
    public CageCellDetail toggleStatus(Long animalCageId, String statusField) {
        return toggleStatus(animalCageId, statusField, null);
    }

    /** 切换特殊状态标记 — 关闭状态时自动归档照片和笔记到历史 */
    public CageCellDetail toggleStatus(Long animalCageId, String statusField, String operatorName) {
        CageCellDetail d = getOrCreate(animalCageId);
        boolean wasOn = switch (statusField) {
            case "needs_division" -> Boolean.TRUE.equals(d.getNeedsDivision());
            case "needs_special_feeding" -> Boolean.TRUE.equals(d.getNeedsSpecialFeeding());
            case "has_health_abnormality" -> Boolean.TRUE.equals(d.getHasHealthAbnormality());
            default -> false;
        };

        // 状态从 ON → OFF：归档当前照片和笔记
        if (wasOn) {
            String imgs = d.getImagesJson();
            String notes = d.getExperimentDesc();
            if ((imgs != null && !imgs.isEmpty() && !"[]".equals(imgs))
                    || (notes != null && !notes.isBlank())) {
                CageCellHistory h = new CageCellHistory();
                h.setAnimalCageId(animalCageId);
                h.setStatusField(statusField);
                h.setImagesJson(imgs);
                h.setExperimentDesc(notes);
                h.setToggledBy(operatorName);
                h.setAction("unmarked");
                historyMapper.insert(h);
                log.info("[local] ARCHIVE animalCageId={} field={} imgs={} notesLen={}",
                        animalCageId, statusField,
                        imgs != null ? imgs.length() : 0,
                        notes != null ? notes.length() : 0);
            }
            // 清除当前照片和笔记（状态已关闭，数据进入历史）
            d.setImagesJson("[]");
            d.setExperimentDesc(null);
        }

        // 切换状态值
        switch (statusField) {
            case "needs_division" -> d.setNeedsDivision(!wasOn);
            case "needs_special_feeding" -> d.setNeedsSpecialFeeding(!wasOn);
            case "has_health_abnormality" -> d.setHasHealthAbnormality(!wasOn);
        }

        // 状态从 OFF → ON：清空照片（全新开始），归档旧数据如果有
        if (!wasOn) {
            String oldImgs = d.getImagesJson();
            String oldNotes = d.getExperimentDesc();
            if ((oldImgs != null && !oldImgs.isEmpty() && !"[]".equals(oldImgs))
                    || (oldNotes != null && !oldNotes.isBlank())) {
                CageCellHistory h = new CageCellHistory();
                h.setAnimalCageId(animalCageId);
                h.setStatusField(statusField);
                h.setImagesJson(oldImgs);
                h.setExperimentDesc(oldNotes);
                h.setToggledBy(operatorName);
                h.setAction("marked");
                historyMapper.insert(h);
            }
            d.setImagesJson("[]");
            d.setExperimentDesc(null);
        }

        detailMapper.batchUpsert(List.of(d));
        log.info("[local] TOGGLE animalCageId={} field={} wasOn={} nowOn={} by={}",
                animalCageId, statusField, wasOn, !wasOn, operatorName);
        return d;
    }

    private void clearSpecialStatuses(CageCellDetail d) {
        d.setNeedsDivision(false);
        d.setNeedsSpecialFeeding(false);
        d.setNeedsTransfer(false);
        d.setHasHealthAbnormality(false);
        d.setCohabitationDate(null);
        d.setSpecialBreedingName(null);
        d.setSpecialBreedingDesc(null);
        d.setImagesJson(null);
        d.setExperimentDesc(null);
    }

    private CageCellDetail getOrCreate(Long animalCageId) {
        CageCellDetail d = detailMapper.selectByAnimalCageId(animalCageId);
        if (d == null) {
            d = new CageCellDetail();
            d.setAnimalCageId(animalCageId);
        }
        return d;
    }
}
