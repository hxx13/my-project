package com.example.demo.modules.personnel.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PersonnelSignatureServiceTest {

    @Mock private PersonnelService personnelService;
    @Mock private JdbcTemplate jdbcTemplate;

    private PersonnelSignatureService service() {
        return new PersonnelSignatureService(personnelService, jdbcTemplate);
    }

    // ─────────── 不可更改 ───────────

    @Test
    void submit_rejects_when_already_signed() {
        // 唯一键撞上 = 已经签过了。应用层也要给出可读文案，而不是抛裸的 DuplicateKeyException
        when(jdbcTemplate.update(contains("INSERT INTO personnel_signature"), any(), any(), any()))
                .thenThrow(new DuplicateKeyException("uk_personnel_signature"));

        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> service().submit(9L, "/api/upload/files/a.png", "WEB"));
        assertTrue(ex.getMessage().contains("不可更改"), "文案要说清不可更改，实际: " + ex.getMessage());
    }

    @Test
    void submit_rejects_blank_image() {
        assertThrows(IllegalArgumentException.class, () -> service().submit(9L, "  ", "WEB"));
        verifyNoInteractions(jdbcTemplate);
    }

    @Test
    void createLink_refuses_when_already_signed() {
        when(personnelService.resolveIdByAccount("STAFF_x")).thenReturn("9");
        when(jdbcTemplate.queryForList(contains("FROM personnel_signature"), eq(9L)))
                .thenReturn(List.of(Map.of("image_url", "/a.png")));

        assertThrows(IllegalStateException.class, () -> service().createLink("STAFF_x", null));
    }

    // ─────────── 管理员重置 ───────────

    @Test
    void reset_deletes_the_signature() {
        when(jdbcTemplate.update(contains("DELETE FROM personnel_signature"), eq(9L))).thenReturn(1);

        assertEquals(1, service().reset(9L, "STAFF_admin"));
        verify(jdbcTemplate).update(contains("DELETE FROM personnel_signature"), eq(9L));
    }

    // ─────────── 限时链接：三条失败分支要分开 ───────────

    @Test
    void resolveLink_rejects_unknown_token() {
        when(jdbcTemplate.queryForList(contains("FROM signature_link"), eq("nope"))).thenReturn(List.of());
        assertThrows(IllegalStateException.class, () -> service().resolveLink("nope"));
    }

    @Test
    void resolveLink_rejects_consumed_link() {
        when(jdbcTemplate.queryForList(contains("FROM signature_link"), eq("t1")))
                .thenReturn(List.of(row(LocalDateTime.now().plusMinutes(10), LocalDateTime.now())));

        IllegalStateException ex = assertThrows(IllegalStateException.class, () -> service().resolveLink("t1"));
        assertTrue(ex.getMessage().contains("已使用"), "应区分「已使用」，实际: " + ex.getMessage());
    }

    @Test
    void resolveLink_rejects_expired_link() {
        when(jdbcTemplate.queryForList(contains("FROM signature_link"), eq("t2")))
                .thenReturn(List.of(row(LocalDateTime.now().minusMinutes(1), null)));

        IllegalStateException ex = assertThrows(IllegalStateException.class, () -> service().resolveLink("t2"));
        assertTrue(ex.getMessage().contains("已过期"), "应区分「已过期」，实际: " + ex.getMessage());
    }

    @Test
    void resolveLink_returns_name_when_valid() {
        when(jdbcTemplate.queryForList(contains("FROM signature_link"), eq("t3")))
                .thenReturn(List.of(row(LocalDateTime.now().plusMinutes(10), null)));

        Map<String, Object> out = service().resolveLink("t3");
        assertEquals(9L, ((Number) out.get("personnelId")).longValue());
        assertEquals("张三", out.get("name"));
    }

    // ─────────── 并发消费只成功一次 ───────────

    @Test
    void consumeLink_throws_when_already_claimed_by_concurrent_request() {
        when(jdbcTemplate.queryForList(contains("FROM signature_link"), eq("t4")))
                .thenReturn(List.of(row(LocalDateTime.now().plusMinutes(10), null)));
        // 条件 UPDATE 影响行数 0 = 已被别的请求抢先消费
        when(jdbcTemplate.update(contains("consumed_at = NOW()"), eq("t4"))).thenReturn(0);

        assertThrows(IllegalStateException.class,
                () -> service().consumeLink("t4", "/api/upload/files/a.png"));
    }

    /**
     * 造一行 signature_link 查询结果。
     *
     * <p>用 {@link LocalDateTime} 而不是 {@code Timestamp} —— **这是 Connector/J 8 对 DATETIME 的真实返回类型**。
     * 一开始这里写的是 Timestamp，测试全绿但真机直接 ClassCastException，是典型的「mock 与现实不符」。
     */
    private static Map<String, Object> row(LocalDateTime expiresAt, LocalDateTime consumedAt) {
        Map<String, Object> m = new java.util.HashMap<>();
        m.put("personnel_id", 9L);
        m.put("name", "张三");
        m.put("expires_at", expiresAt);
        m.put("consumed_at", consumedAt);
        return m;
    }
}
