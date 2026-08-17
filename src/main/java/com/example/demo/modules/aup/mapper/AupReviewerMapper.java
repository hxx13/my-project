package com.example.demo.modules.aup.mapper;

import com.example.demo.modules.aup.dto.ExpertCandidate;
import com.example.demo.modules.aup.entity.AupReviewer;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface AupReviewerMapper {

    int insert(AupReviewer row);

    int deleteAll();

    int countByUserIdRole(@Param("userId") String userId, @Param("reviewerRole") String reviewerRole);

    List<ExpertCandidate> selectExpertCandidates();

    List<ExpertCandidate> selectSecretaryCandidates();

    /** 按 userId 列表批量查 name/dept（aro_personnel；无档案的行由调用方兜底 name=userId）。 */
    List<ExpertCandidate> selectCandidatesByUserIds(@Param("userIds") List<String> userIds);
}
