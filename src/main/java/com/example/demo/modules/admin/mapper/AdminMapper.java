package com.example.demo.modules.admin.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

@Mapper
public interface AdminMapper {
    List<Map<String, Object>> getPersonnelWithAuth(@Param("keyword") String keyword,
                                                   @Param("limit") int limit,
                                                   @Param("offset") int offset);

    int countPersonnelWithAuth(@Param("keyword") String keyword);

    List<Map<String, Object>> getSystemOnlyUsers(@Param("keyword") String keyword,
                                                 @Param("limit") int limit,
                                                 @Param("offset") int offset);

    int countSystemOnlyUsers(@Param("keyword") String keyword);
}
