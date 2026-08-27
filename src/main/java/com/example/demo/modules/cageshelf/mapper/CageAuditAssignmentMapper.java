package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageAuditAssignment;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/** 笼位申请审核人归属 Mapper（由 @MapperScan 扫描）。 */
public interface CageAuditAssignmentMapper {
    int insert(CageAuditAssignment row);
    int deleteByReviewer(@Param("reviewerUserId") String reviewerUserId);
    List<CageAuditAssignment> listByReviewer(@Param("reviewerUserId") String reviewerUserId);
    List<CageAuditAssignment> listAll();
}
