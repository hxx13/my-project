package com.example.demo.modules.aup.mapper;

import com.example.demo.modules.aup.dto.AupListItem;
import com.example.demo.modules.aup.entity.AupRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface AupRecordMapper {

    int insert(AupRecord record);

    AupRecord selectById(@Param("id") Long id);

    /** 审批结算用：锁定主记录行，防并发重复结算 */
    AupRecord selectForUpdateById(@Param("id") Long id);

    /**
     * 状态机流转 CAS：仅当 current_stage 与 version 同时匹配才更新，0 行即并发冲突（409）。
     * 各可空字段用 COALESCE(#{x}, 原列) 保留原值。
     */
    int updateStageCas(@Param("id") Long id,
                       @Param("fromStage") String fromStage,
                       @Param("toStage") String toStage,
                       @Param("expectedVersion") Long expectedVersion,
                       @Param("draftSource") String draftSource,
                       @Param("roundNo") Integer roundNo,
                       @Param("registerNo") String registerNo,
                       @Param("registerYear") Integer registerYear,
                       @Param("registerSeq") Integer registerSeq,
                       @Param("expireAt") LocalDateTime expireAt,
                       @Param("approvedAt") LocalDateTime approvedAt,
                       @Param("submittedAt") LocalDateTime submittedAt);

    /** 提交时回填项目冗余字段（列表展示/搜索用） */
    int updateProjectMeta(@Param("id") Long id,
                          @Param("projectName") String projectName,
                          @Param("piUserId") String piUserId,
                          @Param("piName") String piName,
                          @Param("dept") String dept,
                          @Param("projectSource") String projectSource);

    /** 注册号取号：按年取最大序号（每年从 1 递增，uk_register_year_seq 兜底唯一） */
    Integer selectMaxSeqByYear(@Param("year") int year);

    /** 到期任务：扫描 approved 且 expire_at<=now 的记录 */
    List<AupRecord> selectExpiringApproved(@Param("now") LocalDateTime now);

    List<AupListItem> selectPage(@Param("scopeRole") String scopeRole,
                                 @Param("scopeUserId") String scopeUserId,
                                 @Param("scopeProjectGroup") String scopeProjectGroup,
                                 @Param("keyword") String keyword,
                                 @Param("registerNo") String registerNo,
                                 @Param("stage") String stage,
                                 @Param("excludeStage") String excludeStage,
                                 @Param("projectGroupName") String projectGroupName,
                                 @Param("excludeDraft") boolean excludeDraft,
                                 @Param("draftSource") String draftSource,
                                 @Param("roundNo") Integer roundNo,
                                 @Param("submitterId") String submitterId,
                                 @Param("reviewerId") String reviewerId,
                                 @Param("sortBy") String sortBy,
                                 @Param("sortDir") String sortDir,
                                 @Param("offset") int offset,
                                 @Param("limit") int limit);

    /** 删除模板版本前引用校验：该 template_id 被多少份计划书引用 */
    int countByTemplateId(@Param("templateId") Long templateId);

    int countPage(@Param("scopeRole") String scopeRole,
                  @Param("scopeUserId") String scopeUserId,
                  @Param("scopeProjectGroup") String scopeProjectGroup,
                  @Param("keyword") String keyword,
                  @Param("registerNo") String registerNo,
                  @Param("stage") String stage,
                  @Param("excludeStage") String excludeStage,
                  @Param("projectGroupName") String projectGroupName,
                  @Param("excludeDraft") boolean excludeDraft,
                  @Param("draftSource") String draftSource,
                  @Param("roundNo") Integer roundNo,
                  @Param("submitterId") String submitterId,
                  @Param("reviewerId") String reviewerId);
}
