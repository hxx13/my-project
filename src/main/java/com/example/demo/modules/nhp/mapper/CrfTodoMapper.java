package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfTodo;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 待办 mapper。 */
@Mapper
public interface CrfTodoMapper {

    @Insert("INSERT INTO crf_todo (subject_id, transplant_id, todo_type, source, source_ref, due_date, status, active) " +
            "VALUES (#{subjectId}, #{transplantId}, #{todoType}, #{source}, #{sourceRef}, #{dueDate}, #{status}, #{active})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfTodo row);

    @Select("SELECT * FROM crf_todo WHERE id = #{id}")
    CrfTodo findById(Long id);

    @Select("SELECT * FROM crf_todo WHERE subject_id = #{subjectId} AND active = 1 ORDER BY due_date, id")
    List<CrfTodo> listBySubjectId(Long subjectId);

    @Select("SELECT * FROM crf_todo WHERE active = 1 AND status = 'OPEN' ORDER BY due_date, id LIMIT #{limit}")
    List<CrfTodo> listOpenRecent(@Param("limit") int limit);

    @Select("SELECT COUNT(*) FROM crf_todo WHERE active = 1 AND status = 'OPEN'")
    int countOpen();

    @Select("SELECT COUNT(*) FROM crf_todo WHERE subject_id = #{subjectId} AND active = 1 AND status = 'OPEN'")
    int countOpenBySubject(Long subjectId);

    @Select("SELECT COUNT(*) FROM crf_todo WHERE subject_id = #{subjectId} AND active = 1 AND status = 'OPEN' " +
            "AND due_date IS NOT NULL AND due_date < CURDATE()")
    int countOverdueBySubject(Long subjectId);

    @Update("UPDATE crf_todo SET status = #{status} WHERE id = #{id}")
    int updateStatus(@Param("id") Long id, @Param("status") String status);
}
