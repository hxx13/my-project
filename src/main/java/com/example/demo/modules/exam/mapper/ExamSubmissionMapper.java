package com.example.demo.modules.exam.mapper;

import com.example.demo.modules.exam.entity.ExamSubmission;
import org.apache.ibatis.annotations.*;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface ExamSubmissionMapper {

    @Insert("""
            INSERT INTO exam_submission (paper_id, person_id, answers_json, score_json, total_score,
                                         qualify_score_snapshot, qualify_yn, files_json, submitted_at, updated_at)
            VALUES (#{paperId}, #{personId}, #{answersJson}, #{scoreJson}, #{totalScore},
                    #{qualifyScoreSnapshot}, #{qualifyYn}, #{filesJson}, NOW(), NOW())
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(ExamSubmission s);

    @Update("""
            UPDATE exam_submission SET
                answers_json = #{answersJson},
                score_json = #{scoreJson},
                total_score = #{totalScore},
                qualify_score_snapshot = #{qualifyScoreSnapshot},
                qualify_yn = #{qualifyYn},
                files_json = #{filesJson},
                submitted_at = NOW(),
                updated_at = NOW()
            WHERE id = #{id}
            """)
    int update(ExamSubmission s);

    @Select("""
            SELECT id, paper_id AS paperId, person_id AS personId, answers_json AS answersJson,
                   score_json AS scoreJson, total_score AS totalScore,
                   qualify_score_snapshot AS qualifyScoreSnapshot, qualify_yn AS qualifyYn,
                   files_json AS filesJson, submitted_at AS submittedAt, updated_at AS updatedAt
            FROM exam_submission WHERE paper_id = #{paperId} AND person_id = #{personId}
            """)
    ExamSubmission findByPaperAndPerson(@Param("paperId") Long paperId, @Param("personId") String personId);

    @Select("""
            SELECT s.id, s.paper_id AS paperId, s.person_id AS personId, s.answers_json AS answersJson,
                   s.score_json AS scoreJson, s.total_score AS totalScore,
                   s.qualify_score_snapshot AS qualifyScoreSnapshot, s.qualify_yn AS qualifyYn,
                   s.files_json AS filesJson, s.submitted_at AS submittedAt, s.updated_at AS updatedAt,
                   p.name AS personName, p.job_number AS jobNumber, e.title AS paperTitle
            FROM exam_submission s
            LEFT JOIN aro_personnel p ON p.user_id = s.person_id
            LEFT JOIN exam_paper e ON e.id = s.paper_id
            WHERE s.id = #{id}
            """)
    ExamSubmission findById(@Param("id") Long id);

    @Select("""
            SELECT s.id, s.paper_id AS paperId, s.person_id AS personId, s.total_score AS totalScore,
                   s.qualify_score_snapshot AS qualifyScoreSnapshot, s.qualify_yn AS qualifyYn,
                   s.submitted_at AS submittedAt, s.updated_at AS updatedAt,
                   p.name AS personName, p.job_number AS jobNumber, e.title AS paperTitle
            FROM exam_submission s
            LEFT JOIN aro_personnel p ON p.user_id = s.person_id
            LEFT JOIN exam_paper e ON e.id = s.paper_id
            WHERE s.paper_id = #{paperId}
            ORDER BY s.submitted_at DESC
            """)
    List<ExamSubmission> listByPaperId(@Param("paperId") Long paperId);

    @Select("""
            SELECT s.id, s.paper_id AS paperId, s.person_id AS personId, s.total_score AS totalScore,
                   s.qualify_score_snapshot AS qualifyScoreSnapshot, s.qualify_yn AS qualifyYn,
                   s.submitted_at AS submittedAt, s.updated_at AS updatedAt,
                   p.name AS personName, p.job_number AS jobNumber, e.title AS paperTitle
            FROM exam_submission s
            LEFT JOIN aro_personnel p ON p.user_id = s.person_id
            LEFT JOIN exam_paper e ON e.id = s.paper_id
            ORDER BY s.submitted_at DESC
            """)
    List<ExamSubmission> listAll();
}
