package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageInfoCodelistLink;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface CageInfoCodelistLinkMapper {

    List<CageInfoCodelistLink> selectByItemId(@Param("itemId") Long itemId);

    int insert(CageInfoCodelistLink row);

    int deleteById(@Param("id") Long id);
}
