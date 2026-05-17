package com.example.demo.modules.twin.mapper;

import com.example.demo.modules.twin.entity.TwinStudentViolation;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface TwinStudentViolationMapper {

    int expireActivePastDue();

    int supersedeActiveByTargetUserId(@Param("targetUserId") String targetUserId);

    TwinStudentViolation selectActiveByTargetUserId(@Param("targetUserId") String targetUserId);

    int insert(TwinStudentViolation row);

    int updateClearById(@Param("id") long id, @Param("clearedByUserId") String clearedByUserId);

    /** 管理员标记已处理：不再在扫码弹窗展示（非 ACTIVE） */
    int markProcessedById(@Param("id") long id, @Param("operatorUserId") String operatorUserId);

    int incrementEnterSuccess(@Param("id") long id);

    List<TwinStudentViolation> selectRecent(
            @Param("targetUserId") String targetUserId,
            @Param("limit") int limit
    );

    TwinStudentViolation selectById(@Param("id") long id);

    int updateEditableById(TwinStudentViolation row);

    int deleteById(@Param("id") long id);
}
