package com.example.demo.modules.aup.mapper;

import com.example.demo.modules.aup.entity.AupConfigChangeLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Mapper
public interface AupConfigChangeLogMapper {
    int insert(AupConfigChangeLog row);
    List<AupConfigChangeLog> listByFilter(@Param("entity") String entity, @Param("changeType") String changeType,
                                          @Param("operatorId") Long operatorId, @Param("keyword") String keyword,
                                          @Param("dateFrom") LocalDateTime dateFrom,
                                          @Param("dateTo") LocalDateTime dateTo,
                                          @Param("limit") int limit, @Param("offset") int offset);
    int countByFilter(@Param("entity") String entity, @Param("changeType") String changeType,
                      @Param("operatorId") Long operatorId, @Param("keyword") String keyword,
                      @Param("dateFrom") LocalDateTime dateFrom, @Param("dateTo") LocalDateTime dateTo);
    /** 按 entity 分组计数，供前端分类 chip。 */
    List<Map<String, Object>> summarizeByEntity();
}
