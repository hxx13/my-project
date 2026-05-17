package com.example.demo.common.web;

import com.example.demo.common.dto.Result;
import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.common.exception.TwinBusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

class GlobalExceptionHandlerTest {

    private GlobalExceptionHandler handler;

    @BeforeEach
    void setUp() {
        handler = new GlobalExceptionHandler();
    }

    @Test
    void twinBusinessException_usesCustomCode() {
        Result<Void> r = handler.handleTwinBusiness(
                TwinBusinessException.of(ErrorCodeConstants.TWIN_SCAN_WINDOW_DENIED, "不在扫码时段"));
        assertFalse(r.getSuccess());
        assertEquals(ErrorCodeConstants.TWIN_SCAN_WINDOW_DENIED, r.getCode());
        assertEquals("不在扫码时段", r.getMessage());
    }

    @Test
    void illegalArgument_mapsToBadRequest() {
        Result<Void> r = handler.handleBadRequest(new IllegalArgumentException("id 无效"));
        assertEquals(ErrorCodeConstants.BAD_REQUEST, r.getCode());
    }
}
