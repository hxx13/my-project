package com.example.demo.modules.aup.mapper;

import com.example.demo.modules.aup.dto.AupListItem;
import com.example.demo.modules.aup.entity.AupRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

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
                          @Param("projectSource") String projectSource,
                          @Param("projectGroupId") Long projectGroupId);

    /** 批准时写入动物白名单 + 有效期状态（active），供订购侧可购校验 */
    int updateRegistryMeta(@Param("id") Long id,
                           @Param("animalAllowlist") String animalAllowlist,
                           @Param("status") String status);

    /** 解锁返修时清空动物白名单与 registry status */
    int clearRegistryMeta(@Param("id") Long id);

    /** 订购侧：按课题组名查已批准 AUP 下拉（id/registerNo/projectGroupName/projectGroupId） */
    List<Map<String, Object>> selectApprovedForOrder(@Param("projectGroupName") String projectGroupName);

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
                                 @Param("excludeStages") List<String> excludeStages,
                                 @Param("projectGroupName") String projectGroupName,
                                 @Param("excludeDraft") boolean excludeDraft,
                                 @Param("draftSource") String draftSource,
                                 @Param("roundNo") Integer roundNo,
                                 @Param("submitterId") String submitterId,
                                 @Param("reviewerId") String reviewerId,
                                 @Param("submitterName") String submitterName,
                                 @Param("reviewerName") String reviewerName,
                                 @Param("relatedToMe") boolean relatedToMe,
                                 @Param("groupScopeOnly") boolean groupScopeOnly,
                                 @Param("sortBy") String sortBy,
                                 @Param("sortDir") String sortDir,
                                 @Param("offset") int offset,
                                 @Param("limit") int limit);

    /** 删除模板版本前引用校验：该 template_id 被多少份计划书引用 */
    int countByTemplateId(@Param("templateId") Long templateId);

    /** 模板下「本地填写」计划书数（非 aro 同步、非 demo）——删除模板时若有则禁止删除 */
    int countLocalRecords(@Param("templateId") Long templateId);

    /** 模板下「可级联删除」的计划书 id（aro 同步或 demo） */
    List<Long> listDeletableRecordIds(@Param("templateId") Long templateId);

    /** 批量删除计划书主记录 */
    int deleteByIds(@Param("ids") List<Long> ids);

    int countPage(@Param("scopeRole") String scopeRole,
                  @Param("scopeUserId") String scopeUserId,
                  @Param("scopeProjectGroup") String scopeProjectGroup,
                  @Param("keyword") String keyword,
                  @Param("registerNo") String registerNo,
                  @Param("stage") String stage,
                  @Param("excludeStage") String excludeStage,
                  @Param("excludeStages") List<String> excludeStages,
                  @Param("projectGroupName") String projectGroupName,
                  @Param("excludeDraft") boolean excludeDraft,
                  @Param("draftSource") String draftSource,
                  @Param("roundNo") Integer roundNo,
                  @Param("submitterId") String submitterId,
                  @Param("reviewerId") String reviewerId,
                  @Param("submitterName") String submitterName,
                  @Param("reviewerName") String reviewerName,
                  @Param("relatedToMe") boolean relatedToMe,
                  @Param("groupScopeOnly") boolean groupScopeOnly);

    /** 列表筛选用：去重课题组名称 */
    List<String> selectDistinctProjectGroups();

    /** 同步 ARO 已通过 AUP → aup_record(approved)：按 register_no 去重 upsert（仅写已有字段） */
    int upsertSyncedApproved(@Param("list") List<Map<String, Object>> rows);

    /** AUP 下拉字典（自己的字段口径）：approved 记录的 id/registerNo/projectGroupName */
    List<Map<String, Object>> selectApprovedForDict();
}
