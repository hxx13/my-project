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

    public boolean isImpersonated(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return false;
        }
        String token = authHeader.substring("Bearer ".length()).trim();
        if (token.isBlank()) {
            return false;
        }
        return jwtTokenService.isImpersonatedToken(token);
    }

    /** 模拟学生视图时解析出背后的教职工身份；非模拟返回 null */
    public User resolveImpersonator(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return null;
        }
        String token = authHeader.substring("Bearer ".length()).trim();
        if (token.isBlank()) {
            return null;
        }
        return jwtTokenService.resolveImpersonator(token);
    }
}
