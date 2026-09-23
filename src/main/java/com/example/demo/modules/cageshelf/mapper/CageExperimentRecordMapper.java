package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageExperimentRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 笼位实验记录台账。**没有** update-submitted / delete —— 已提交记录只读是设计约束，
 * 不是权限问题；唯一的改写入口是草稿（{@link #updateDraftContent} / {@link #submitDraft}，
 * 两条都带 {@code status='DRAFT'} 条件，碰不到已提交行）。
 */
@Mapper
public interface CageExperimentRecordMapper {

    int insert(CageExperimentRecord record);

    /** 台账正卷：该笼位当前占用期的已提交记录（归档的不进台账，只进记录模式），按提交时间倒序 */
    List<CageExperimentRecord> selectSubmitted(@Param("animalCageId") Long animalCageId);

    /** 记录模式：全部记录（含归档），按创建时间倒序 */
    List<CageExperimentRecord> selectAll(@Param("animalCageId") Long animalCageId);

    /** 「我的实验记录」：本人写过的全部记录（含已在历史笼位上归档的），按笼位聚拢。
     *  authorIds 是同一个人的**多种账号形态**（personnel.id / STAFF_ / ARO 编号），不能只传一个。 */
    List<CageExperimentRecord> selectByAuthors(@Param("authorIds") List<String> authorIds);

    /** 本人的当前草稿（同人同笼位最多一条）。authorIds 同上，按人收口而不是按某一种账号 id。 */
    CageExperimentRecord selectDraft(@Param("animalCageId") Long animalCageId,
                                     @Param("authorIds") List<String> authorIds);

    /** 保存草稿：仅命中 DRAFT 行 */
    int updateDraftContent(@Param("id") Long id,
                           @Param("content") String content,
                           @Param("imagesJson") String imagesJson);

    /** 提交草稿：DRAFT → SUBMITTED，同时落 submitted_at。仅命中 DRAFT 行 */
    int submitDraft(@Param("id") Long id,
                    @Param("content") String content,
                    @Param("imagesJson") String imagesJson);

    /** 占用者变更 / 笼位归档：该笼位未归档的记录整体退役（含未提交草稿） */
    int archiveByAnimalCageId(@Param("animalCageId") Long animalCageId);
}
