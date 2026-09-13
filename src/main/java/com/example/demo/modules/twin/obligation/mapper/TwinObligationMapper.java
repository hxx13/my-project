package com.example.demo.modules.twin.obligation.mapper;

import com.example.demo.modules.twin.obligation.entity.TwinObligation;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface TwinObligationMapper {
    int insert(TwinObligation row);

    TwinObligation selectBySource(@Param("sourceType") String sourceType, @Param("sourceId") String sourceId);

    TwinObligation selectById(@Param("id") long id);

    List<TwinObligation> selectBySubject(
            @Param("subjectUserId") String subjectUserId,
            @Param("status") String status,
            @Param("limit") int limit);

    List<TwinObligation> selectAdmin(
            @Param("subjectUserId") String subjectUserId,
            @Param("sourceType") String sourceType,
            @Param("status") String status,
            @Param("limit") int limit);

    int updateStatus(@Param("id") long id, @Param("status") String status);

    /** 提交处置计数 +1（成功或失败都算）；答题重试上限据此判定 */
    int incrementAttempt(@Param("id") long id);

    int updateContentAndDue(TwinObligation row);

    /** 存量违规回填：插入尚无 obligation 的 ACTIVE 违规对应行 */
    int backfillFromActiveViolations(@Param("limit") int limit);

    /** due_at 已过且非终态 → EXPIRED */
    int expireOverdue(@Param("limit") int limit);
}
