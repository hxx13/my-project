package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfDag;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 数据访问组 mapper。 */
@Mapper
public interface CrfDagMapper {

    @Insert("INSERT INTO crf_dag (code, study_id) VALUES (#{code}, #{studyId})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfDag row);

    @Select("SELECT * FROM crf_dag WHERE id = #{id}")
    CrfDag findById(Long id);

    @Select("SELECT * FROM crf_dag WHERE study_id = #{studyId} ORDER BY id")
    List<CrfDag> listByStudyId(Long studyId);
}
