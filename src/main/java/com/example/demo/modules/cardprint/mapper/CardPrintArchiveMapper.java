package com.example.demo.modules.cardprint.mapper;

import com.example.demo.modules.cardprint.entity.CardPrintArchive;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface CardPrintArchiveMapper {
    List<CardPrintArchive> selectPage(@Param("offset") int offset, @Param("limit") int limit);
    int count();
    CardPrintArchive selectById(@Param("id") Long id);
    int insert(CardPrintArchive a);
    int deleteById(@Param("id") Long id);
}
