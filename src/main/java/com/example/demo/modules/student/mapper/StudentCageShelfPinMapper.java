package com.example.demo.modules.student.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface StudentCageShelfPinMapper {
    /** Returns pinned shelveIds for user (ordered by creation time). */
    List<String> selectPinnedShelveIds(@Param("userId") String userId);

    int insert(@Param("userId") String userId, @Param("shelveId") String shelveId);

    int delete(@Param("userId") String userId, @Param("shelveId") String shelveId);

    int exists(@Param("userId") String userId, @Param("shelveId") String shelveId);
}
