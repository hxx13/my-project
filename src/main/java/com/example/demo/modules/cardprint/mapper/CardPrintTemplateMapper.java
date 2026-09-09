package com.example.demo.modules.cardprint.mapper;

import com.example.demo.modules.cardprint.entity.CardPrintTemplate;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface CardPrintTemplateMapper {
    List<CardPrintTemplate> selectAll();
    CardPrintTemplate selectById(@Param("id") Long id);
    CardPrintTemplate selectByName(@Param("name") String name);
    int insert(CardPrintTemplate t);
    int update(CardPrintTemplate t);
    int deleteById(@Param("id") Long id);
    int clearDefault();
    int markDefault(@Param("id") Long id);
}
