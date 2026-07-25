package com.example.demo.modules.notification.push.digest;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface UserDigestPreferenceMapper {
    UserDigestPreference findByUserAndSource(@Param("userId") String userId, @Param("sourceCode") String sourceCode);
    List<UserDigestPreference> findByUserId(@Param("userId") String userId);
    int insert(UserDigestPreference pref);
    int update(UserDigestPreference pref);
    int delete(@Param("id") Long id);
    int upsert(UserDigestPreference pref);
}
