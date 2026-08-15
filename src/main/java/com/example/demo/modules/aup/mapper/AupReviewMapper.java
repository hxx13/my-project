package com.example.demo.modules.aup.mapper;

import com.example.demo.modules.aup.dto.AupRecordView;
import com.example.demo.modules.aup.dto.ReviewTodoItem;
import com.example.demo.modules.aup.dto.ReviewVoteVO;
import com.example.demo.modules.aup.dto.VoteAggregate;
import com.example.demo.modules.aup.entity.AupReview;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface AupReviewMapper {

    int insert(AupReview row);

    AupReview selectByAupReviewerRound(@Param("aupId") long aupId,
                                       @Param("reviewer") String reviewer,
                                       @Param("roundNo") int roundNo);

    /** 某轮次投票聚合（分配/回避/各 verdict 计数），结算判定输入 */
    VoteAggregate aggregateVotes(@Param("aupId") long aupId, @Param("roundNo") int roundNo);

    /** 某轮次已投专家逐人记录（role=expert），投票进度卡逐人展示用 */
    List<ReviewVoteVO> selectVotesByAupRound(@Param("aupId") long aupId, @Param("roundNo") int roundNo);

    /** 某模板版本下的全部 field_key（逐字段评审合法性校验） */
    List<String> selectFieldKeysByTemplate(@Param("templateId") long templateId);

    long countTemplateFields(@Param("templateId") long templateId);

    /** 读取主记录（普通读，含 pi/created_by 冗余，供阶段/归属校验） */
    AupRecordView selectRecordBasic(@Param("aupId") long aupId);

    /** 锁定主记录（专家结算临界区，FOR UPDATE） */
    AupRecordView selectRecordForUpdate(@Param("aupId") long aupId);

    /** 写审查形式（格式通过时落 review_form；仅此一列，非 current_stage 变更） */
    int updateReviewForm(@Param("aupId") long aupId, @Param("reviewForm") String reviewForm);

    List<ReviewTodoItem> selectSecretaryTodo();

    List<ReviewTodoItem> selectExpertTodo(@Param("reviewerId") String reviewerId);

    List<ReviewTodoItem> selectPiTodo(@Param("piUserId") String piUserId);

    List<ReviewTodoItem> selectPiTodoAll();
}
