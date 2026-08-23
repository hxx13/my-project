package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageInfoCodelist;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface CageInfoCodelistMapper {

    List<CageInfoCodelist> selectAll();

    CageInfoCodelist selectByCode(@Param("code") String code);

    CageInfoCodelist selectById(@Param("id") Long id);

    int countByCode(@Param("code") String code);

    int insert(CageInfoCodelist row);

    int updateMeta(CageInfoCodelist row);

    int deleteById(@Param("id") Long id);
}
