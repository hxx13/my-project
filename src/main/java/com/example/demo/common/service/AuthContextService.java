package com.example.demo.common.service;

import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import org.springframework.stereotype.Service;

@Service
public class AuthContextService {
    private static final String TOKEN_PREFIX = "jwt_mock_token_";

    private final UserMapper userMapper;

    public AuthContextService(UserMapper userMapper) {
        this.userMapper = userMapper;
    }

    public User resolveUserFromBearer(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return null;
        }
        String token = authHeader.substring("Bearer ".length()).trim();
        if (!token.startsWith(TOKEN_PREFIX)) {
            return null;
        }
        String userId = token.substring(TOKEN_PREFIX.length());
        if (userId.isBlank()) {
            return null;
        }
        return userMapper.findById(userId);
    }
}
