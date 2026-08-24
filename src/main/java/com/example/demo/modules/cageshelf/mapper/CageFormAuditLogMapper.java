package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageFormAuditLog;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

public interface CageFormAuditLogMapper {

    int insert(CageFormAuditLog row);

    List<CageFormAuditLog> listFiltered(@Param("category") String category,
                                        @Param("keyword") String keyword,
                                        @Param("changeType") String changeType,
                                        @Param("entity") String entity,
                                        @Param("operatorId") String operatorId,
                                        @Param("dateFrom") String dateFrom,
                                        @Param("dateTo") String dateTo,
                                        @Param("offset") int offset,
                                        @Param("limit") int limit);

    long countFiltered(@Param("category") String category,
                       @Param("keyword") String keyword,
                       @Param("changeType") String changeType,
                       @Param("entity") String entity,
                       @Param("operatorId") String operatorId,
                       @Param("dateFrom") String dateFrom,
                       @Param("dateTo") String dateTo);

    List<Map<String, Object>> countByEntity(@Param("category") String category);
}
