package com.example.demo.modules.twin.mapper;

import com.example.demo.modules.twin.entity.TwinCardMapping;
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
}