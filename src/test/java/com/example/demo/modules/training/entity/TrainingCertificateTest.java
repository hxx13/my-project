package com.example.demo.modules.training.entity;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.*;

class TrainingCertificateTest {

    @Test
    void 编号取发证年份_六位补零() {
        TrainingCertificate c = new TrainingCertificate();
        c.setId(123L);
        c.setIssuedAt(LocalDateTime.of(2026, 9, 24, 10, 0));
        assertEquals("SHSMU-2026-000123", c.certNo());
    }

    @Test
    void 没发证时间退培训日期() {
        TrainingCertificate c = new TrainingCertificate();
        c.setId(7L);
        c.setTrainingDate(LocalDate.of(2025, 3, 1));
        assertEquals("SHSMU-2025-000007", c.certNo());
    }

    @Test
    void 两个时间都没有也不炸() {
        TrainingCertificate c = new TrainingCertificate();
        c.setId(9L);
        assertTrue(c.certNo().matches("SHSMU-\\d{4}-000009"));
    }

    @Test
    void 没入库没编号() {
        assertTrue(new TrainingCertificate().certNo().isEmpty());
    }
}
