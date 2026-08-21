package com.example.demo.modules.auth.mapper;

import com.example.demo.modules.auth.entity.UserAuthBinding;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface UserAuthBindingMapper {

    @Select("SELECT id, user_id AS userId, idp_uid AS idpUid, idp_user_name AS idpUserName, " +
            "bound_at AS boundAt, unbound_at AS unboundAt " +
            "FROM user_auth_binding WHERE idp_uid = #{idpUid} AND unbound_at IS NULL LIMIT 1")
    UserAuthBinding findActiveByIdpUid(@Param("idpUid") String idpUid);

    @Select("SELECT id, user_id AS userId, idp_uid AS idpUid, idp_user_name AS idpUserName, " +
            "bound_at AS boundAt, unbound_at AS unboundAt " +
            "FROM user_auth_binding WHERE user_id = #{userId} AND unbound_at IS NULL LIMIT 1")
    UserAuthBinding findActiveByUserId(@Param("userId") String userId);

    @Insert("INSERT INTO user_auth_binding (user_id, idp_uid, idp_user_name, bound_at) " +
            "VALUES (#{userId}, #{idpUid}, #{idpUserName}, NOW())")
    int insert(UserAuthBinding binding);

    @Update("UPDATE user_auth_binding SET unbound_at = NOW() " +
            "WHERE idp_uid = #{idpUid} AND unbound_at IS NULL")
    int softUnbindByIdpUid(@Param("idpUid") String idpUid);
}
