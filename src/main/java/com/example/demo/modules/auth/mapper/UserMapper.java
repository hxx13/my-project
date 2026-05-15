package com.example.demo.modules.auth.mapper;

import com.example.demo.modules.auth.entity.User;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface UserMapper {
    User findByUsername(@Param("username") String username);

    User findByUsernameAndPassword(@Param("username") String username, @Param("password") String password);

    User findByOpenId(@Param("openId") String openId);

    User findById(@Param("id") String id);

    User findByIdAndPassword(@Param("id") String id, @Param("password") String password);

    int insertUser(User user);

    int updateOpenIdById(@Param("id") String id, @Param("openId") String openId, @Param("miniBindType") String miniBindType);

    int clearOpenIdById(@Param("id") String id);

    int updateDisplayNicknameById(@Param("id") String id, @Param("displayNickname") String displayNickname);

    int updateMiniPreferencesJsonById(@Param("id") String id, @Param("miniPreferencesJson") String miniPreferencesJson);

    int updateAuthProfileById(@Param("id") String id, @Param("authProfile") String authProfile);

    int updateRoleById(@Param("id") String id, @Param("role") String role);

    int updateStatusById(@Param("id") String id, @Param("status") Integer status);

    int updatePasswordById(@Param("id") String id, @Param("password") String password);

    int updatePasswordAndResetRequiredById(@Param("id") String id,
                                           @Param("password") String password,
                                           @Param("passwordResetRequired") Integer passwordResetRequired);

    int insertBindAudit(@Param("openId") String openId,
                        @Param("identifier") String identifier,
                        @Param("bindType") String bindType,
                        @Param("clientIp") String clientIp,
                        @Param("status") String status,
                        @Param("message") String message);

    int existsPersonnelById(@Param("id") String id);

    int deleteById(@Param("id") String id);

    List<User> listEnabledUsersByMinRoleLevel(@Param("minRoleLevel") Integer minRoleLevel);
}
