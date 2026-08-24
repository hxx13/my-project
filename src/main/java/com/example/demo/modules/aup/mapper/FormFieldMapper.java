package com.example.demo.modules.aup.mapper;

import com.example.demo.modules.aup.dto.AupFieldTemplateRef;
import com.example.demo.modules.aup.entity.FormField;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface FormFieldMapper {
    int insert(FormField row);
    int update(FormField row);
    /** 直属 section（section_id IN ...） */
    List<FormField> listBySectionIds(@Param("sectionIds") List<Long> sectionIds);
    /** 挂 subsection（subsection_id IN ...） */
    List<FormField> listBySubsectionIds(@Param("subsectionIds") List<Long> subsectionIds);
    int deleteBySectionIds(@Param("sectionIds") List<Long> sectionIds);
    int deleteBySubsectionIds(@Param("subsectionIds") List<Long> subsectionIds);
    /** 统计引用某字典键的字段数（删字典前校验）。 */
    int countByDictKey(@Param("dictKey") String dictKey);
    /** 发布时回填字段的 dict 版本号。 */
    int updateDictVersion(@Param("id") Long id, @Param("dictVersion") Integer dictVersion);
    /** 统计引用某字段编码的原子域字段数（字段域 usage / 删除校验）。 */
    int countRefByFieldCode(@Param("fieldCode") String fieldCode);
    /** 引用某字段编码的原子域模板引用列表（字段域 usage 详情）。 */
    List<AupFieldTemplateRef> listAtomRefsByFieldCode(@Param("fieldCode") String fieldCode);
}
