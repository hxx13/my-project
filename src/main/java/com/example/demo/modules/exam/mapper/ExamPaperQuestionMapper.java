package com.example.demo.modules.exam.mapper;

import com.example.demo.modules.exam.entity.ExamPaperQuestion;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface ExamPaperQuestionMapper {

    @Insert("""
            INSERT INTO exam_paper_question
                (paper_id, section_id, question_key, label, type, required,
                 options_json, show_when_json, sort_order, config_json, created_at)
            VALUES
                (#{paperId}, #{sectionId}, #{questionKey}, #{label}, #{type}, #{required},
                 #{optionsJson}, #{showWhenJson}, #{sortOrder}, #{configJson}, NOW())
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(ExamPaperQuestion question);

    @Select("""
            SELECT id, paper_id AS paperId, section_id AS sectionId,
                   question_key AS questionKey, label, type, required,
                   options_json AS optionsJson,
                   show_when_json AS showWhenJson,
                   sort_order AS sortOrder,
                   config_json AS configJson,
                   created_at AS createdAt
            FROM exam_paper_question
            WHERE paper_id = #{paperId}
            ORDER BY sort_order ASC, id ASC
            """)
    List<ExamPaperQuestion> listByPaperId(@Param("paperId") Long paperId);

    @Delete("DELETE FROM exam_paper_question WHERE paper_id = #{paperId}")
    int deleteByPaperId(@Param("paperId") Long paperId);
}
