package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfVisit;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 访视/时点定义 mapper。 */
@Mapper
public interface CrfVisitMapper {

    @Insert("INSERT INTO crf_visit (scheme_id, code, name, seq, repeating, planned_days, early_days, late_days, end_days, event_anchor, active) " +
            "VALUES (#{schemeId}, #{code}, #{name}, #{seq}, #{repeating}, #{plannedDays}, #{earlyDays}, #{lateDays}, #{endDays}, #{eventAnchor}, #{active})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfVisit row);

    @Update("UPDATE crf_visit SET event_anchor = #{eventAnchor} WHERE id = #{id}")
    int updateEventAnchor(@Param("id") Long id, @Param("eventAnchor") String eventAnchor);

    @Update("UPDATE crf_visit SET end_days = #{endDays} WHERE id = #{id}")
    int updateEndDays(@Param("id") Long id, @Param("endDays") Integer endDays);

    @Update("UPDATE crf_visit SET scheme_id = #{schemeId}, code = #{code}, name = #{name}, seq = #{seq}, repeating = #{repeating}, " +
            "planned_days = #{plannedDays}, early_days = #{earlyDays}, late_days = #{lateDays}, " +
            "end_days = #{endDays}, event_anchor = #{eventAnchor}, active = #{active} WHERE id = #{id}")
    int update(CrfVisit row);

    @Update("UPDATE crf_visit SET active = 0 WHERE id = #{id}")
    int softDelete(@Param("id") Long id);

    @Update("UPDATE crf_visit SET code = #{code} WHERE id = #{id}")
    int updateCode(@Param("id") Long id, @Param("code") String code);

    @Select("SELECT * FROM crf_visit WHERE active = 1 AND event_anchor = #{eventAnchor} ORDER BY seq")
    List<CrfVisit> listByEventAnchor(String eventAnchor);

    @Select("<script>SELECT * FROM crf_visit WHERE active = 1 " +
            "<choose><when test='schemeId != null'>AND scheme_id = #{schemeId}</when>" +
            "<otherwise>AND scheme_id IS NULL</otherwise></choose> ORDER BY seq</script>")
    List<CrfVisit> listBySchemeId(@Param("schemeId") Long schemeId);

    @Select("SELECT * FROM crf_visit WHERE id = #{id}")
    CrfVisit findById(Long id);

    @Select("SELECT * FROM crf_visit WHERE code = #{code}")
    CrfVisit findByCode(String code);

    @Select("SELECT * FROM crf_visit WHERE active = 1 ORDER BY seq")
    List<CrfVisit> list();
}
