package com.example.demo.modules.aup.mapper;

import com.example.demo.modules.aup.entity.FormSubsection;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface FormSubsectionMapper {
    int insert(FormSubsection row);
    List<FormSubsection> listBySectionIds(@Param("sectionIds") List<Long> sectionIds);
    int deleteBySectionIds(@Param("sectionIds") List<Long> sectionIds);
}
