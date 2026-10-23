package com.example.demo.modules.student.service;

import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.student.entity.StudentMobileToken;
import com.example.demo.modules.student.mapper.StudentMobileTokenMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class StudentMobileTokenServiceTest {

    private StudentMobileTokenMapper mapper;
    private StudentMobileTokenService service;

    @BeforeEach
    void setUp() {
        mapper = mock(StudentMobileTokenMapper.class);
        service = new StudentMobileTokenService(mapper);
    }

    private StudentMobileToken token(boolean active, LocalDateTime expiresAt) {
        StudentMobileToken t = new StudentMobileToken();
        t.setToken("abc");
        t.setUserId("u-1");
        t.setIsActive(active);
        t.setExpiresAt(expiresAt);
        return t;
    }

    @Test
    void validTokenReturnsUserId() {
        when(mapper.selectByToken("abc")).thenReturn(token(true, LocalDateTime.now().plusDays(1)));
        assertEquals("u-1", service.validateToken("abc"));
    }

    @Test
    void revokedTokenRejected() {
        when(mapper.selectByToken("abc")).thenReturn(token(false, LocalDateTime.now().plusDays(1)));
        assertThrows(TwinBusinessException.class, () -> service.validateToken("abc"));
    }

    @Test
    void missingTokenRejected() {
        when(mapper.selectByToken(anyString())).thenReturn(null);
        assertThrows(TwinBusinessException.class, () -> service.validateToken("nope"));
    }

    @Test
    void expiredTokenRejected() {
        when(mapper.selectByToken("abc")).thenReturn(token(true, LocalDateTime.now().minusSeconds(1)));
        assertThrows(TwinBusinessException.class, () -> service.validateToken("abc"));
    }

    @Test
    void generateWritesLongTermExpiry() {
        service.generateToken("u-1");
        ArgumentCaptor<LocalDateTime> expires = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(mapper).insert(anyString(), org.mockito.ArgumentMatchers.eq("u-1"), expires.capture());
        assertTrue(expires.getValue().isAfter(LocalDateTime.now().plusYears(5)));
    }
}
