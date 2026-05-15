package com.example.demo.modules.auth.service;

import com.example.demo.modules.aro.mapper.AroDatabaseMapper;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * 展示用姓名：优先人员库姓名，其次账号名，最后回退 userId。
 */
@Service
public class UserDisplayNameService {
    private final AroDatabaseMapper aroDatabaseMapper;
    private final UserMapper userMapper;

    public UserDisplayNameService(AroDatabaseMapper aroDatabaseMapper, UserMapper userMapper) {
        this.aroDatabaseMapper = aroDatabaseMapper;
        this.userMapper = userMapper;
    }

    public String resolveDisplayName(String userId) {
        if (!StringUtils.hasText(userId)) {
            return "";
        }
        String id = userId.trim();
        String personnelName = aroDatabaseMapper.findPersonnelNameByUserId(id);
        if (StringUtils.hasText(personnelName)) {
            return personnelName.trim();
        }
        User u = userMapper.findById(id);
        if (u != null && StringUtils.hasText(u.getDisplayNickname())) {
            return u.getDisplayNickname().trim();
        }
        if (u != null && StringUtils.hasText(u.getUsername())) {
            return u.getUsername().trim();
        }
        return id;
    }
}
