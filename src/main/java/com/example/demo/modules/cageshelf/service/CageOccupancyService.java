package com.example.demo.modules.cageshelf.service;

import com.alibaba.fastjson2.JSON;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.cageshelf.entity.CageClaim;
import com.example.demo.modules.cageshelf.entity.CageTransferLog;
import com.example.demo.modules.cageshelf.mapper.CageClaimMapper;
import com.example.demo.modules.cageshelf.mapper.CageTransferLogMapper;
import com.example.demo.modules.personnel.entity.Personnel;
import com.example.demo.modules.personnel.service.PersonnelService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
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

    public CageOccupancyService(CageInfoValueService infoValueService,
                                CageTransferLogMapper transferLogMapper,
                                CageClaimMapper claimMapper,
                                PersonnelService personnelService) {
        this.infoValueService = infoValueService;
        this.transferLogMapper = transferLogMapper;
        this.claimMapper = claimMapper;
        this.personnelService = personnelService;
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
