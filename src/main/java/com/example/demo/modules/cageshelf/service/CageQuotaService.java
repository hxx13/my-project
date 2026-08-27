package com.example.demo.modules.cageshelf.service;

import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.cageshelf.mapper.CageQuotaMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * 笼位配额校验服务 — 房间上限 → AUP 可用数 → 实际占用 三级链。
 * <p>
 * 所有写入口统一调这里，禁止各自算（否则切数据源开关即绕过）。
 * 键：register_number 字符串；实际占用实时 COUNT，不存快照。
 */
@Service
public class CageQuotaService {

    private static final Logger log = LoggerFactory.getLogger(CageQuotaService.class);

    private final CageQuotaMapper quotaMapper;

    public CageQuotaService(CageQuotaMapper quotaMapper) {
        this.quotaMapper = quotaMapper;
    }

    /**
     * I3：分配 / 认领前校验。已用 + 本次 ≤ 该 AUP 配额。
     *
     * @param roomId        房间数值 id（与 cage_shelf_index.room_id 同口径）
     * @param registerNo    AUP 注册号（aup_record.register_no / cage_cell_detail.aup_number）
     * @param additionalCount 本次新增占用格位数
     */
    public void assertCanAllocate(Long roomId, String registerNo, int additionalCount) {
        if (roomId == null || registerNo == null || registerNo.isBlank()) {
            // 无房间或无 AUP 归属时不卡配额（无主笼位不受限）
            return;
        }
        int used = quotaMapper.countAupUsedInRoom(roomId, registerNo);
        Integer rentQuota = quotaMapper.selectRentNumber(roomId, registerNo);
        int quota = rentQuota == null ? 0 : rentQuota;
        if (used + additionalCount > quota) {
            throw new TwinBusinessException(409,
                    "超出 AUP 可用笼位数（已用 " + used + "，可用 " + quota + "，本次 " + additionalCount
                            + "），请先在配置中调整 AUP 可用数");
        }
    }

    /**
     * I2：改低房间上限时校验，新上限 ≥ 已切出的配额之和。
     */
    public void assertRoomQuotaValid(Long roomId, Integer newRoomCapacity) {
        if (roomId == null || newRoomCapacity == null) return;
        int sumRent = quotaMapper.sumRentNumber(roomId);
        if (newRoomCapacity < sumRent) {
            throw new TwinBusinessException(409,
                    "房间上限不能小于已分配的 AUP 配额之和（已切 " + sumRent + "），请先调整各 AUP 可用数");
        }
    }

    /**
     * I4：改低 AUP 配额时校验，新配额 ≥ 该 AUP 当前实际占用。
     */
    public void assertAupQuotaValid(Long roomId, String registerNo, Integer newRentNumber) {
        if (roomId == null || registerNo == null || registerNo.isBlank() || newRentNumber == null) return;
        int used = quotaMapper.countAupUsedInRoom(roomId, registerNo);
        if (newRentNumber < used) {
            throw new TwinBusinessException(409,
                    "AUP 可用数不能小于其实际占用（已用 " + used + "），请先释放笼位");
        }
    }
}
