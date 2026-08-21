package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfDagUser;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 数据访问组成员 mapper。 */
@Mapper
public interface CrfDagUserMapper {

    @Insert("INSERT INTO crf_dag_user (dag_id, personnel_id) VALUES (#{dagId}, #{personnelId})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfDagUser row);

    @Select("SELECT * FROM crf_dag_user WHERE dag_id = #{dagId} ORDER BY id")
    List<CrfDagUser> listByDagId(Long dagId);

    @Delete("DELETE FROM crf_dag_user WHERE dag_id = #{dagId} AND personnel_id = #{personnelId}")
    int delete(@Param("dagId") Long dagId, @Param("personnelId") String personnelId);
}
