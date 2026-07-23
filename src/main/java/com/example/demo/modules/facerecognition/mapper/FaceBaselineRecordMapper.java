package com.example.demo.modules.facerecognition.mapper;

import com.example.demo.modules.facerecognition.entity.FaceBaselineRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface FaceBaselineRecordMapper {
    int insert(FaceBaselineRecord record);
    int deleteById(@Param("id") Long id);
    int deleteByUserId(@Param("userId") String userId);
    FaceBaselineRecord findByUserId(@Param("userId") String userId);
    List<FaceBaselineRecord> findAllByUserId(@Param("userId") String userId);
    FaceBaselineRecord findById(@Param("id") Long id);
}
