package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.ApprovalRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface ApprovalRecordMapper {

    int insert(ApprovalRecord record);

    /** 按关联目标查询审批历史 */
    List<ApprovalRecord> selectByTarget(@Param("targetType") String targetType,
                                         @Param("targetId") Long targetId);

    /** 按审批人查询 */
    List<ApprovalRecord> selectByApprover(@Param("approverId") String approverId,
                                           @Param("offset") int offset,
                                           @Param("limit") int limit);
}
