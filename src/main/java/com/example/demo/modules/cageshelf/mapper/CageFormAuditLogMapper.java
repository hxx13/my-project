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
                                        @Param("personId") Long personId,
                                        @Param("dateFrom") String dateFrom,
                                        @Param("dateTo") String dateTo,
                                        @Param("offset") int offset,
                                        @Param("limit") int limit);

    long countFiltered(@Param("category") String category,
                       @Param("keyword") String keyword,
                       @Param("changeType") String changeType,
                       @Param("entity") String entity,
                       @Param("operatorId") String operatorId,
                       @Param("personId") Long personId,
                       @Param("dateFrom") String dateFrom,
                       @Param("dateTo") String dateTo);

    List<Map<String, Object>> countByEntity(@Param("category") String category);

    /**
     * 留痕页：按「操作」聚合分页 —— 同笼位 + 同类型 + 同一秒的多条字段记录归为一次操作。
     * operatorKind: null=全部 / "manual"=仅人工 / "system"=仅系统同步。
     */
    List<Map<String, Object>> pageOperationGroups(@Param("category") String category,
                                                  @Param("keyword") String keyword,
                                                  @Param("changeType") String changeType,
                                                  @Param("entity") String entity,
                                                  @Param("operatorId") String operatorId,
                                                  @Param("personId") Long personId,
                                                  @Param("operatorKind") String operatorKind,
                                                  @Param("dateFrom") String dateFrom,
                                                  @Param("dateTo") String dateTo,
                                                  @Param("offset") int offset,
                                                  @Param("limit") int limit);

    long countOperationGroups(@Param("category") String category,
                              @Param("keyword") String keyword,
                              @Param("changeType") String changeType,
                              @Param("entity") String entity,
                              @Param("operatorId") String operatorId,
                              @Param("personId") Long personId,
                              @Param("operatorKind") String operatorKind,
                              @Param("dateFrom") String dateFrom,
                              @Param("dateTo") String dateTo);

    /** 取本页操作分组下的全部字段级明细，按 时间倒序 + 组内 id 升序。 */
    List<CageFormAuditLog> listByOperationGroups(@Param("category") String category,
                                                 @Param("keyword") String keyword,
                                                 @Param("changeType") String changeType,
                                                 @Param("entity") String entity,
                                                 @Param("operatorId") String operatorId,
                                                 @Param("personId") Long personId,
                                                 @Param("operatorKind") String operatorKind,
                                                 @Param("dateFrom") String dateFrom,
                                                 @Param("dateTo") String dateTo,
                                                 @Param("offset") int offset,
                                                 @Param("limit") int limit);

    /** 某笼位(target_id)的全部 data 类审计，按时间升序（供按笼盒分组追溯）。 */
    List<CageFormAuditLog> listByTargetId(@Param("targetId") Long targetId,
                                          @Param("category") String category);
}
