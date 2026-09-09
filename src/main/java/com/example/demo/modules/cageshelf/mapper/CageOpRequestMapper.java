package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageOpRequest;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface CageOpRequestMapper {

    int insert(CageOpRequest request);

    int update(CageOpRequest request);

    CageOpRequest selectById(@Param("id") Long id);

    /** FOR UPDATE 锁单条（审批用，防并发双批） */
    CageOpRequest selectByIdForUpdate(@Param("id") Long id);

    /** 按状态/类型查（审核队列；小队列，调用方在内存里按审核人归属过滤） */
    List<CageOpRequest> selectByStatus(@Param("status") String status,
                                       @Param("opType") String opType);

    /** 申请人自己的请求（学生视角「我的操作」） */
    List<CageOpRequest> selectByApplicant(@Param("applicantId") String applicantId,
                                          @Param("status") String status);
}
