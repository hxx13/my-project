package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfDictChangeLog;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 字段字典变更审计 mapper（只追加）。 */
@Mapper
public interface CrfDictChangeLogMapper {

    @Insert("INSERT INTO crf_dict_change_log (entity, entity_id, change_type, before_json, after_json, operator) " +
            "VALUES (#{entity}, #{entityId}, #{changeType}, #{beforeJson}, #{afterJson}, #{operator})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfDictChangeLog row);

    @Select("SELECT * FROM crf_dict_change_log WHERE entity = #{entity} AND entity_id = #{entityId} ORDER BY id DESC")
    List<CrfDictChangeLog> listByEntity(@Param("entity") String entity, @Param("entityId") Long entityId);

    @Select("SELECT * FROM crf_dict_change_log ORDER BY id DESC LIMIT #{limit}")
    List<CrfDictChangeLog> listRecent(@Param("limit") int limit);

    @Select("<script>SELECT d.* FROM crf_dict_change_log d " +
            "LEFT JOIN crf_field f ON d.entity = 'field' AND f.id = d.entity_id " +
            "LEFT JOIN crf_codelist c ON d.entity = 'codelist' AND c.id = d.entity_id " +
            "LEFT JOIN crf_form fm ON d.entity = 'form' AND fm.id = d.entity_id " +
            "WHERE 1=1 " +
            "<if test='entityType != null and entityType != \"\"'>AND d.entity = #{entityType}</if> " +
            "<if test='changeType != null and changeType != \"\"'>AND d.change_type = #{changeType}</if> " +
            "<if test='operatorId != null and operatorId != \"\"'>AND d.operator = #{operatorId}</if> " +
            "<if test='dateFrom != null and dateFrom != \"\"'>AND d.created_at &gt;= #{dateFrom}</if> " +
            "<if test='dateTo != null and dateTo != \"\"'>AND d.created_at &lt; #{dateTo}</if> " +
            "<if test='keyword != null and keyword != \"\"'>AND (" +
            "f.field_code LIKE CONCAT('%', #{keyword}, '%') OR " +
            "f.name_cn LIKE CONCAT('%', #{keyword}, '%') OR " +
            "c.code LIKE CONCAT('%', #{keyword}, '%') OR " +
            "c.name LIKE CONCAT('%', #{keyword}, '%') OR " +
            "fm.code LIKE CONCAT('%', #{keyword}, '%') OR " +
            "fm.name LIKE CONCAT('%', #{keyword}, '%') OR " +
            "d.operator LIKE CONCAT('%', #{keyword}, '%'))</if> " +
            "ORDER BY d.id DESC LIMIT #{limit} OFFSET #{offset}</script>")
    List<CrfDictChangeLog> listFiltered(@Param("entityType") String entityType,
                                        @Param("keyword") String keyword,
                                        @Param("changeType") String changeType,
                                        @Param("operatorId") String operatorId,
                                        @Param("dateFrom") String dateFrom,
                                        @Param("dateTo") String dateTo,
                                        @Param("offset") int offset,
                                        @Param("limit") int limit);

    @Select("<script>SELECT COUNT(1) FROM crf_dict_change_log d " +
            "LEFT JOIN crf_field f ON d.entity = 'field' AND f.id = d.entity_id " +
            "LEFT JOIN crf_codelist c ON d.entity = 'codelist' AND c.id = d.entity_id " +
            "LEFT JOIN crf_form fm ON d.entity = 'form' AND fm.id = d.entity_id " +
            "WHERE 1=1 " +
            "<if test='entityType != null and entityType != \"\"'>AND d.entity = #{entityType}</if> " +
            "<if test='changeType != null and changeType != \"\"'>AND d.change_type = #{changeType}</if> " +
            "<if test='operatorId != null and operatorId != \"\"'>AND d.operator = #{operatorId}</if> " +
            "<if test='dateFrom != null and dateFrom != \"\"'>AND d.created_at &gt;= #{dateFrom}</if> " +
            "<if test='dateTo != null and dateTo != \"\"'>AND d.created_at &lt; #{dateTo}</if> " +
            "<if test='keyword != null and keyword != \"\"'>AND (" +
            "f.field_code LIKE CONCAT('%', #{keyword}, '%') OR " +
            "f.name_cn LIKE CONCAT('%', #{keyword}, '%') OR " +
            "c.code LIKE CONCAT('%', #{keyword}, '%') OR " +
            "c.name LIKE CONCAT('%', #{keyword}, '%') OR " +
            "fm.code LIKE CONCAT('%', #{keyword}, '%') OR " +
            "fm.name LIKE CONCAT('%', #{keyword}, '%') OR " +
            "d.operator LIKE CONCAT('%', #{keyword}, '%'))</if></script>")
    long countFiltered(@Param("entityType") String entityType,
                       @Param("keyword") String keyword,
                       @Param("changeType") String changeType,
                       @Param("operatorId") String operatorId,
                       @Param("dateFrom") String dateFrom,
                       @Param("dateTo") String dateTo);

    @Select("SELECT entity, COUNT(*) AS cnt FROM crf_dict_change_log GROUP BY entity ORDER BY entity")
    List<java.util.Map<String, Object>> countByEntity();
}
