package com.example.demo.modules.twin.card.mapper;

import com.example.demo.modules.twin.card.entity.TwinCardMapping;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface TwinCardMappingMapper {

    // ================== 1. 双向极速寻址 (打卡核心链路) ==================
    TwinCardMapping findByCardNo(@Param("cardNo") String cardNo);

    TwinCardMapping findByAroUserId(@Param("aroUserId") String aroUserId);

    // ================== 2. 管理端数据写入与状态变更 ==================
    void insertMapping(TwinCardMapping mapping);

    void updateExemptFlag(@Param("cardNo") String cardNo, @Param("flag") Integer flag,
                          @Param("expireAt") String expireAt, @Param("updateTime") String updateTime,
                          @Param("mode") String mode, @Param("maxCount") Integer maxCount,
                          @Param("roomIds") String roomIds);

    void updateCardStatus(@Param("cardNo") String cardNo, @Param("status") String status, @Param("updateTime") String updateTime);

    // ================== 3. 孪生大屏前端渲染专用 (左连接人员库防腐) ==================
    List<TwinCardMapping> findAllWithUserInfo();

    // ================== 4. 阶段二补丁：专供内存缓存加载使用 ==================
    List<TwinCardMapping> findAll();

    // 在 TwinCardMappingMapper 接口中补充
    void deleteMapping(@Param("cardNo") String cardNo);

    List<String> findTodayStrandedUserIds(@Param("todayPrefix") String todayPrefix);

    List<String> findTodayExemptedThenRevokedUserIds();

    int updateExemptFlagByUserId(@Param("aroUserId") String aroUserId, @Param("flag") int flag,
                                 @Param("expireAt") String expireAt,
                                 @Param("mode") String mode, @Param("maxCount") Integer maxCount,
                                 @Param("roomIds") String roomIds);

    int resetDailyExemptions();

    int clearAllExemptFlagsKeepGrantTrace();

    int revokeExpiredExemptionsByTodayKeepCard();

    /** 收回 freeze_exempt_expire_at 已到的豁免 */
    int revokeExpiredExemptionsByExpireAt();

    /** 当前库中 freeze_exempt_flag=1 的全部映射（定时兜底回收 / 首次冻结清空前快照，含姓名） */
    List<TwinCardMapping> findAllActiveExemptions();

    /** 定时兜底：收回全部生效豁免，无视授予日/到期/流水规则 */
    int forceRevokeAllActiveExemptions();

    /** 今日曾授予豁免（含已提前收回 flag=0） */
    List<TwinCardMapping> findMappingsExemptedToday();

    /** 今日流水判定仍在馆（有进入、同房间无离开），与雷达滞留口径一致 */
    List<String> findTodayStillInsideUserIdsByAccessLog(
            @Param("todayStart") String todayStart,
            @Param("todayEnd") String todayEnd);

    // ========== 免冻结增强：次数模式 ==========

    /** 递增免冻结已使用次数；达到上限时自动收回豁免 */
    int incrementExemptUsedCount(@Param("aroUserId") String aroUserId, @Param("roomId") String roomId);

    /** 收回次数已耗尽的 COUNT/BOTH 豁免（定时兜底） */
    int revokeExhaustedCountExemptions();

    // ========== 豁免收回前快照（WHERE 与对应 UPDATE 逐字镜像，供逐人记 EXEMPT_REVOKED 台账） ==========

    /** 时效到期收回前快照（镜像 {@link #revokeExpiredExemptionsByExpireAt}，含姓名） */
    List<TwinCardMapping> findExpiredExemptSnapshots();

    /** 次数耗尽收回前快照（镜像 {@link #revokeExhaustedCountExemptions}，含姓名） */
    List<TwinCardMapping> findExhaustedCountExemptSnapshots();

    /** 开机洗刷收回前快照（镜像 {@link #resetDailyExemptions}，含姓名） */
    List<TwinCardMapping> findStartupResetExemptSnapshots();

    /** 事件溯源纠偏收回前快照（镜像 {@link #revokeExpiredExemptionsByTodayKeepCard}，含姓名） */
    List<TwinCardMapping> findReconcileRevokeSnapshots();

    /** 单卡记账快照：DB 直读带姓名，供单人豁免路径（授予/收回）记账 */
    TwinCardMapping findLedgerSnapshotByCardNo(@Param("cardNo") String cardNo);

    /** 单人记账快照：DB 直读带姓名，供单人豁免路径（授予/收回/次数递增）记账 */
    TwinCardMapping findLedgerSnapshotByUserId(@Param("aroUserId") String aroUserId);
}