package com.example.demo.modules.exam.mapper;

import com.example.demo.modules.exam.entity.ExamPaperFolder;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface ExamPaperFolderMapper {

    @Insert("""
            INSERT INTO exam_paper_folder (name, created_at)
            VALUES (#{name}, NOW())
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(ExamPaperFolder folder);

    @Select("""
            SELECT id, name, created_at AS createdAt
            FROM exam_paper_folder ORDER BY id
            """)
    List<ExamPaperFolder> list();

    @Update("UPDATE exam_paper_folder SET name = #{name} WHERE id = #{id}")
    int updateName(@Param("id") Long id, @Param("name") String name);

    @Delete("DELETE FROM exam_paper_folder WHERE id = #{id}")
    int delete(@Param("id") Long id);

    @Select("""
            SELECT id, name, created_at AS createdAt
            FROM exam_paper_folder WHERE id = #{id}
            """)
    ExamPaperFolder findById(@Param("id") Long id);
}
