package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfRecord;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 表单实例 mapper。 */
@Mapper
public interface CrfRecordMapper {

    @Insert("INSERT INTO crf_record (subject_id, form_id, form_version_id, visit_instance_id, status, dag_id, created_by) " +
            "VALUES (#{subjectId}, #{formId}, #{formVersionId}, #{visitInstanceId}, #{status}, #{dagId}, #{createdBy})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfRecord row);

    @Select("SELECT * FROM crf_record WHERE id = #{id}")
    CrfRecord findById(Long id);

    @Select("SELECT * FROM crf_record WHERE subject_id = #{subjectId} ORDER BY id")
    List<CrfRecord> listBySubjectId(Long subjectId);

    @Select("<script>SELECT r.* FROM crf_record r " +
            "INNER JOIN crf_subject s ON s.id = r.subject_id WHERE 1=1 " +
            "<choose>" +
            "  <when test='status != null'>AND r.status = #{status}</when>" +
            "  <otherwise>AND r.status &lt;&gt; 'DELETED'</otherwise>" +
            "</choose> " +
            "<if test='subjectId != null'>AND r.subject_id = #{subjectId}</if> " +
            "<if test='q != null'>AND (CAST(r.id AS CHAR) LIKE CONCAT('%', #{q}, '%') " +
            "OR s.subject_code LIKE CONCAT('%', #{q}, '%') " +
            "OR CAST(s.id AS CHAR) LIKE CONCAT('%', #{q}, '%'))</if> " +
            "ORDER BY r.id DESC LIMIT #{limit} OFFSET #{offset}</script>")
    List<CrfRecord> listPaged(@Param("status") String status,
                              @Param("subjectId") Long subjectId,
                              @Param("q") String q,
                              @Param("offset") int offset,
                              @Param("limit") int limit);

    @Select("<script>SELECT COUNT(1) FROM crf_record r " +
            "INNER JOIN crf_subject s ON s.id = r.subject_id WHERE 1=1 " +
            "<choose>" +
            "  <when test='status != null'>AND r.status = #{status}</when>" +
            "  <otherwise>AND r.status &lt;&gt; 'DELETED'</otherwise>" +
            "</choose> " +
            "<if test='subjectId != null'>AND r.subject_id = #{subjectId}</if> " +
            "<if test='q != null'>AND (CAST(r.id AS CHAR) LIKE CONCAT('%', #{q}, '%') " +
            "OR s.subject_code LIKE CONCAT('%', #{q}, '%') " +
            "OR CAST(s.id AS CHAR) LIKE CONCAT('%', #{q}, '%'))</if></script>")
    long countPaged(@Param("status") String status,
                    @Param("subjectId") Long subjectId,
                    @Param("q") String q);

    @Update("UPDATE crf_record SET status = #{status} WHERE id = #{id}")
    int updateStatus(@Param("id") Long id, @Param("status") String status);

    @Select("SELECT COUNT(1) FROM crf_record WHERE subject_id = #{subjectId} AND status <> 'DELETED'")
    long countActiveBySubjectId(Long subjectId);

    @Update("UPDATE crf_record SET status = 'DELETED' WHERE subject_id = #{subjectId} AND status <> 'DELETED'")
    int softDeleteBySubjectId(Long subjectId);

    /** 填写实例是否仍引用该模板版本（发布组合被引用时禁止删）。 */
    @Select("SELECT COUNT(1) FROM crf_record WHERE form_id = #{formId} AND status <> 'DELETED'")
    long countActiveByFormId(Long formId);
}
