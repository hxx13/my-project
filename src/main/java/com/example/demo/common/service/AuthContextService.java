package com.example.demo.common.service;

import com.example.demo.common.config.JwtTokenService;
import com.example.demo.modules.auth.entity.User;
import org.springframework.stereotype.Service;

@Service
public class AuthContextService {

    private final JwtTokenService jwtTokenService;

    public AuthContextService(JwtTokenService jwtTokenService) {
        this.jwtTokenService = jwtTokenService;
    }

    public User resolveUserFromBearer(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return null;
        }
        String token = authHeader.substring("Bearer ".length()).trim();
        if (token.isBlank()) {
            return null;
        }
        return jwtTokenService.validateTokenAndResolveUser(token);
    }
}
