package com.example.demo.modules.exam.mapper;

import com.example.demo.modules.exam.entity.ExamPaper;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface ExamPaperMapper {

    @Insert("""
            INSERT INTO exam_paper (code, title, status, created_by, folder_id, created_at, updated_at)
            VALUES (#{code}, #{title}, #{status}, #{createdBy}, #{folderId}, NOW(), NOW())
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(ExamPaper paper);

    @Select("""
            SELECT id, code, title, status,
                   created_by AS createdBy,
                   folder_id AS folderId,
                   created_at AS createdAt,
                   updated_at AS updatedAt
            FROM exam_paper WHERE id = #{id}
            """)
    ExamPaper findById(@Param("id") Long id);

    @Select("""
            SELECT id, code, title, status,
                   created_by AS createdBy,
                   folder_id AS folderId,
                   created_at AS createdAt,
                   updated_at AS updatedAt
            FROM exam_paper WHERE code = #{code}
            """)
    ExamPaper findByCode(@Param("code") String code);

    @Select("""
            SELECT id, code, title, status,
                   created_by AS createdBy,
                   folder_id AS folderId,
                   created_at AS createdAt,
                   updated_at AS updatedAt
            FROM exam_paper ORDER BY id DESC
            """)
    List<ExamPaper> list();

    @Update("""
            UPDATE exam_paper SET
                title = #{title},
                status = #{status},
                folder_id = #{folderId},
                updated_at = NOW()
            WHERE id = #{id}
            """)
    int update(ExamPaper paper);

    @Update("UPDATE exam_paper SET status = #{status}, updated_at = NOW() WHERE id = #{id}")
    int updateStatus(@Param("id") Long id, @Param("status") String status);

    @Update("UPDATE exam_paper SET folder_id = #{folderId}, updated_at = NOW() WHERE id = #{id}")
    int moveToFolder(@Param("id") Long id, @Param("folderId") Long folderId);

    @Update("UPDATE exam_paper SET folder_id = NULL, updated_at = NOW() WHERE folder_id = #{folderId}")
    int clearFolder(@Param("folderId") Long folderId);

    @Delete("DELETE FROM exam_paper WHERE id = #{id}")
    int delete(@Param("id") Long id);
}
