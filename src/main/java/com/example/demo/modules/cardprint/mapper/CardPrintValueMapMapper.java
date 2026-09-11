package com.example.demo.modules.cardprint.mapper;

import com.example.demo.modules.cardprint.entity.CardPrintValueMap;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface CardPrintValueMapMapper {
    List<CardPrintValueMap> selectAll();
    CardPrintValueMap selectById(@Param("id") Long id);
    int insert(CardPrintValueMap t);
    int update(CardPrintValueMap t);
    int deleteById(@Param("id") Long id);
}
