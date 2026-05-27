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
                          @Param("expireAt") String expireAt, @Param("updateTime") String updateTime);

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
                                 @Param("expireAt") String expireAt);

    int resetDailyExemptions();

    int clearAllExemptFlagsKeepGrantTrace();

    int revokeExpiredExemptionsByTodayKeepCard();

    /** 收回 freeze_exempt_expire_at 已到的豁免 */
    int revokeExpiredExemptionsByExpireAt();

    /** 当前库中 freeze_exempt_flag=1 的全部映射（定时兜底回收前快照） */
    List<TwinCardMapping> findAllActiveExemptions();

    /** 定时兜底：收回全部生效豁免，无视授予日/到期/流水规则 */
    int forceRevokeAllActiveExemptions();

    /** 今日曾授予豁免（含已提前收回 flag=0） */
    List<TwinCardMapping> findMappingsExemptedToday();

    /** 今日流水判定仍在馆（有进入、同房间无离开），与雷达滞留口径一致 */
    List<String> findTodayStillInsideUserIdsByAccessLog(
            @Param("todayStart") String todayStart,
            @Param("todayEnd") String todayEnd);
}