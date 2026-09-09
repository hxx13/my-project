package com.example.demo.modules.exam.mapper;

import com.example.demo.modules.exam.entity.ExamPaperSection;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface ExamPaperSectionMapper {

    @Insert("""
            INSERT INTO exam_paper_section (paper_id, code, label, sort_order, created_at)
            VALUES (#{paperId}, #{code}, #{label}, #{sortOrder}, NOW())
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(ExamPaperSection section);

    @Select("""
            SELECT id, paper_id AS paperId, code, label,
                   sort_order AS sortOrder,
                   created_at AS createdAt
            FROM exam_paper_section
            WHERE paper_id = #{paperId}
            ORDER BY sort_order ASC, id ASC
            """)
    List<ExamPaperSection> listByPaperId(@Param("paperId") Long paperId);

    @Delete("DELETE FROM exam_paper_section WHERE paper_id = #{paperId}")
    int deleteByPaperId(@Param("paperId") Long paperId);
}
