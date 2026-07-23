package com.example.demo.modules.facerecognition.mapper;

import com.example.demo.modules.facerecognition.entity.FaceDebugPhoto;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface FaceDebugPhotoMapper {
    int insert(FaceDebugPhoto photo);
    List<FaceDebugPhoto> findAll();
    FaceDebugPhoto findById(@Param("id") Long id);
    int deleteById(@Param("id") Long id);
}
