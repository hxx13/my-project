package com.example.demo.modules.cageshelf.service;

import com.alibaba.fastjson2.JSON;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.cageshelf.entity.ApprovalRecord;
import com.example.demo.modules.cageshelf.entity.CageCellDetail;
import com.example.demo.modules.cageshelf.entity.CageClaim;
import com.example.demo.modules.cageshelf.entity.CageTransferLog;
import com.example.demo.modules.cageshelf.mapper.ApprovalRecordMapper;
import com.example.demo.modules.cageshelf.mapper.CageCellDetailMapper;
import com.example.demo.modules.cageshelf.mapper.CageClaimMapper;
import com.example.demo.modules.cageshelf.mapper.CageTransferLogMapper;
import com.example.demo.modules.personnel.entity.Personnel;
import com.example.demo.modules.personnel.service.PersonnelService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 笼位占用操作（copy / transfer / exit）。
 *
 * 占用周期 = 个人账号 + 笼位 + 起止时间；占用字段随个人迁移，笼位固有字段不迁移。
 * 操作人/占用者统一解析到「统一人员 personnel.id + 姓名」，不裸存 sys_user.id
 * （一个人有 staff_id / aro_user_id 两套遗留 id）。每次操作先打时点快照，再落占用事件日志。
 */
@Service
public class CageOccupancyService {

    private final CageInfoValueService infoValueService;
    private final CageTransferLogMapper transferLogMapper;
    private final CageClaimMapper claimMapper;
    private final PersonnelService personnelService;
    private final CageCellDetailMapper detailMapper;
    private final ApprovalRecordMapper approvalMapper;

    public CageOccupancyService(CageInfoValueService infoValueService,
                                CageTransferLogMapper transferLogMapper,
                                CageClaimMapper claimMapper,
                                PersonnelService personnelService,
                                CageCellDetailMapper detailMapper,
                                ApprovalRecordMapper approvalMapper) {
        this.infoValueService = infoValueService;
        this.transferLogMapper = transferLogMapper;
        this.claimMapper = claimMapper;
        this.personnelService = personnelService;
        this.detailMapper = detailMapper;
        this.approvalMapper = approvalMapper;
    }

    /** 复制：占用字段从 from 复制到 to，from 保留；覆盖前给 to 打旧数据快照。 */
    @Transactional
    public Map<String, Object> copy(Long from, Long to, String operatorAccountId, String reason) {
        requireCages(from, to);
        Personnel operator = personnelService.resolveByAccount(operatorAccountId);
        Personnel occupant = resolveOccupant(from);
        String snapshot = JSON.toJSONString(infoValueService.snapshotOccupancy(to));
        infoValueService.copyOccupancyFields(from, to, "COPY");
        writeLog("copy", from, to, occupant, operator, snapshot, reason);
        return ok("copy");
    }

    /** 转笼：占用字段从 from 移到 to，from 清空占用字段；覆盖前给 to 打快照。 */
    @Transactional
    public Map<String, Object> transfer(Long from, Long to, String operatorAccountId, String reason) {
        requireCages(from, to);
        Personnel operator = personnelService.resolveByAccount(operatorAccountId);
        Personnel occupant = resolveOccupant(from);
        String snapshot = JSON.toJSONString(infoValueService.snapshotOccupancy(to));
        infoValueService.copyOccupancyFields(from, to, "TRANSFER");
        infoValueService.clearOccupancyFields(from);
        writeLog("transfer", from, to, occupant, operator, snapshot, reason);
        return ok("transfer");
    }

    /** 退出：清空占用字段，落最终快照（无目标笼位）。 */
    @Transactional
    public Map<String, Object> exit(Long animalCageId, String operatorAccountId, String reason) {
        if (animalCageId == null) throw new TwinBusinessException(400, "animalCageId 必填");
        Personnel operator = personnelService.resolveByAccount(operatorAccountId);
        Personnel occupant = resolveOccupant(animalCageId);
        String snapshot = JSON.toJSONString(infoValueService.snapshotOccupancy(animalCageId));
        infoValueService.clearOccupancyFields(animalCageId);
        writeLog("exit", animalCageId, null, occupant, operator, snapshot, reason);
        return ok("exit");
    }

    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /** 归档：释放活跃认领 + 清空占用/动物/状态(保留 AUP/PI) + 笼位回空笼盒(type2) + 落快照日志。 */
    @Transactional
    public Map<String, Object> archive(Long animalCageId, String operatorAccountId, String reason) {
        if (animalCageId == null) throw new TwinBusinessException(400, "animalCageId 必填");
        Personnel operator = personnelService.resolveByAccount(operatorAccountId);
        Personnel occupant = resolveOccupant(animalCageId);
        String snapshot = JSON.toJSONString(infoValueService.snapshotOccupancy(animalCageId));

        CageClaim claim = claimMapper.selectActiveByAnimalCageId(animalCageId);
        if (claim != null) {
            claim.setClaimStatus("released");
            claim.setReleasedAt(LocalDateTime.now().format(FMT));
            claim.setNote(reason != null && !reason.isBlank() ? "归档释放：" + reason : "归档释放");
            claimMapper.update(claim);
            ApprovalRecord ar = new ApprovalRecord();
            ar.setTargetType("cage_release");
            ar.setTargetId(claim.getId());
            ar.setApproverId(operator != null ? String.valueOf(operator.getId()) : "0");
            ar.setApproverName(operator != null ? operator.getName() : "SYSTEM");
            ar.setApproverRole("SYSTEM");
            ar.setDecision("released");
            ar.setRejectReason("归档 animalCageId=" + animalCageId);
            approvalMapper.insert(ar);
        }

        infoValueService.clearArchiveFields(animalCageId);
        writeLog("archive", animalCageId, null, occupant, operator, snapshot, reason);

        CageCellDetail d = detailMapper.selectByAnimalCageId(animalCageId);
        if (d != null) {
            d.setCageTypeCode(2); // 已预约(空笼盒)
            d.setHasCageBox(false);
            d.setCageBoxCode(null);
            d.setExperimenterName(null);
            d.setLabAssistantName(null);
            d.setAnimalStrainName(null);
            d.setAnimalSex(null);
            d.setAnimalWeekAge(null);
            d.setAnimalMaleNumber(null);
            d.setAnimalFemaleNumber(null);
            d.setAnimalComeFrom(null);
            d.setNeedsDivision(false);
            d.setNeedsSpecialFeeding(false);
            d.setNeedsTransfer(false);
            d.setHasHealthAbnormality(false);
            d.setNeedsCohabitation(false);
            d.setCohabitationDate(null);
            d.setSpecialBreedingName(null);
            d.setSpecialBreedingDesc(null);
            detailMapper.batchUpsert(List.of(d));
        }
        return ok("archive");
    }

    private void requireCages(Long from, Long to) {
        if (from == null || to == null) {
            throw new TwinBusinessException(400, "fromAnimalCageId / toAnimalCageId 必填");
        }
        if (from.equals(to)) {
            throw new TwinBusinessException(400, "源笼位与目标笼位不能相同");
        }
    }

    /** 当前占用者 = 该笼位的活跃认领记录，解析到统一人员（无则 null）。 */
    private Personnel resolveOccupant(Long animalCageId) {
        CageClaim claim = claimMapper.selectActiveByAnimalCageId(animalCageId);
        if (claim == null || claim.getClaimantId() == null) return null;
        return personnelService.resolveByAccount(claim.getClaimantId());
    }

    private void writeLog(String eventType, Long from, Long to, Personnel occupant, Personnel operator,
                          String snapshot, String reason) {
        CageTransferLog log = new CageTransferLog();
        log.setEventType(eventType);
        if (occupant != null) {
            log.setOccupantId(occupant.getId());
            log.setOccupantName(occupant.getName());
        }
        if (operator != null) {
            log.setOperatorId(operator.getId());
            log.setOperatorName(operator.getName());
        }
        log.setFromAnimalCageId(from);
        log.setToAnimalCageId(to);
        log.setDataSnapshot(snapshot);
        log.setReason(reason);
        transferLogMapper.insert(log);
    }

    private Map<String, Object> ok(String action) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("action", action);
        m.put("ok", true);
        return m;
    }
}
