package com.example.demo.modules.aup.mapper;

import com.example.demo.modules.aup.entity.FormField;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface FormFieldMapper {
    int insert(FormField row);
    /** 直属 section（section_id IN ...） */
    List<FormField> listBySectionIds(@Param("sectionIds") List<Long> sectionIds);
    /** 挂 subsection（subsection_id IN ...） */
    List<FormField> listBySubsectionIds(@Param("subsectionIds") List<Long> subsectionIds);
    int deleteBySectionIds(@Param("sectionIds") List<Long> sectionIds);
    int deleteBySubsectionIds(@Param("subsectionIds") List<Long> subsectionIds);
    /** 统计引用某字典键的字段数（删字典前校验）。 */
    int countByDictKey(@Param("dictKey") String dictKey);
}
