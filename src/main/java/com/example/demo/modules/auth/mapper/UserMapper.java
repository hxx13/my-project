package com.example.demo.modules.auth.mapper;

import com.example.demo.modules.auth.entity.User;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface UserMapper {
    User findByUsername(@Param("username") String username);

    User findByOpenId(@Param("openId") String openId);

    User findById(@Param("id") String id);

    List<User> findByIds(@Param("ids") List<String> ids);

    int insertUser(User user);

    int updateOpenIdById(@Param("id") String id, @Param("openId") String openId, @Param("miniBindType") String miniBindType);

    int clearOpenIdById(@Param("id") String id);

    int updateDisplayNicknameById(@Param("id") String id, @Param("displayNickname") String displayNickname);

    User findByDisplayNickname(@Param("displayNickname") String displayNickname);

    int updateMiniPreferencesJsonById(@Param("id") String id, @Param("miniPreferencesJson") String miniPreferencesJson);

    int updateAuthProfileById(@Param("id") String id, @Param("authProfile") String authProfile);

    int updateRoleById(@Param("id") String id, @Param("role") String role);

    int updateStatusById(@Param("id") String id, @Param("status") Integer status);

    int updatePasswordById(@Param("id") String id, @Param("password") String password);

    int updatePasswordAndResetRequiredById(@Param("id") String id,
                                           @Param("password") String password,
                                           @Param("passwordResetRequired") Integer passwordResetRequired);

    int updatePasswordWithPlainById(@Param("id") String id,
                                    @Param("password") String password,
                                    @Param("passwordPlain") String passwordPlain,
                                    @Param("passwordResetRequired") Integer passwordResetRequired);

    int updateUsernameById(@Param("id") String id, @Param("username") String username);

    String getPasswordPlainById(@Param("id") String id);

    int updateUser(User user);

    int insertBindAudit(@Param("openId") String openId,
                        @Param("identifier") String identifier,
                        @Param("bindType") String bindType,
                        @Param("clientIp") String clientIp,
                        @Param("status") String status,
                        @Param("message") String message);

    int existsPersonnelById(@Param("id") String id);

    int deleteById(@Param("id") String id);

    List<User> listEnabledUsersByMinRoleLevel(@Param("minRoleLevel") Integer minRoleLevel);

    List<User> searchByKeyword(@Param("keyword") String keyword);

    int incrementLoginFailCount(@Param("id") String id);

    int lockUserUntil(@Param("id") String id, @Param("lockedUntil") String lockedUntil);

    int clearLoginFailCount(@Param("id") String id);
}
