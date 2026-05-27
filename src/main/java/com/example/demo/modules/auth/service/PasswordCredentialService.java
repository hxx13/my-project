package com.example.demo.modules.auth.service;

import com.example.demo.modules.auth.entity.User;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class PasswordCredentialService {

    private final PasswordEncoder passwordEncoder;

    public PasswordCredentialService(PasswordEncoder passwordEncoder) {
        this.passwordEncoder = passwordEncoder;
    }

    public String encodeForStorage(String rawPassword) {
        return passwordEncoder.encode(rawPassword);
    }

    public boolean verifyAndRehashIfLegacy(User user, String rawPassword) {
        if (user == null || rawPassword == null) {
            return false;
        }
        String stored = user.getPassword();
        if (stored == null) {
            return false;
        }
        return passwordEncoder.matches(rawPassword, stored);
    }
}
