package com.example.demo.modules.twin.obligation.mapper;

import com.example.demo.modules.twin.obligation.entity.TwinQuizBank;
import com.example.demo.modules.twin.obligation.entity.TwinQuizQuestion;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/** 答题题库读写（题库 + 题目一张 mapper，属同一功能域）。 */
@Mapper
public interface TwinQuizBankMapper {

    List<TwinQuizBank> listBanks();

    TwinQuizBank selectBank(@Param("bankId") String bankId);

    int insertBank(TwinQuizBank row);

    int updateBank(TwinQuizBank row);

    int deleteBank(@Param("bankId") String bankId);

    /** 抽题/判分用：只取启用题，按 sort_order */
    List<TwinQuizQuestion> selectEnabledByBank(@Param("bankId") String bankId);

    /** 后台管理用：含停用题 */
    List<TwinQuizQuestion> selectAllByBank(@Param("bankId") String bankId);

    TwinQuizQuestion selectQuestion(@Param("id") long id);

    int insertQuestion(TwinQuizQuestion row);

    int updateQuestion(TwinQuizQuestion row);

    int deleteQuestion(@Param("id") long id);

    /** 该库下一个可用 sort_order（同库内唯一，新增题目时用） */
    Integer nextSortOrder(@Param("bankId") String bankId);

    int countQuestions(@Param("bankId") String bankId);
}
