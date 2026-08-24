package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageFormCompositeAtom;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface CageFormCompositeAtomMapper {

    List<CageFormCompositeAtom> selectByCompositeId(@Param("compositeTemplateId") Long compositeTemplateId);

    List<CageFormCompositeAtom> selectByAtomId(@Param("atomTemplateId") Long atomTemplateId);

    int insert(CageFormCompositeAtom row);

    int deleteByCompositeId(@Param("compositeTemplateId") Long compositeTemplateId);
}
