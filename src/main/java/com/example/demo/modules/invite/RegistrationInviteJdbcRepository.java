package com.example.demo.modules.invite;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public class RegistrationInviteJdbcRepository {

    private final JdbcTemplate jdbc;

    public RegistrationInviteJdbcRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<Map<String, Object>> ROW = (rs, i) -> Map.of(
            "id", rs.getString("id"),
            "expiresAt", rs.getTimestamp("expires_at").toInstant().toString(),
            "maxUses", rs.getInt("max_uses"),
            "usedCount", rs.getInt("used_count"),
            "createdByUserId", rs.getString("created_by_user_id") == null ? "" : rs.getString("created_by_user_id"),
            "inviteKind", rs.getString("invite_kind"),
            "note", rs.getString("note") == null ? "" : rs.getString("note"),
            "revoked", rs.getInt("revoked") == 1,
            "createTime", rs.getTimestamp("create_time").toInstant().toString()
    );

    public void insert(String id, String codeHash, Instant expiresAt, int maxUses, String createdByUserId, String inviteKind, String note) {
        // 占位符须与参数个数一致：id, code_hash, expires_at, max_uses, created_by_user_id, invite_kind, note（used_count/revoked 用字面量 0）
        jdbc.update(
                "INSERT INTO registration_invite(id, code_hash, expires_at, max_uses, used_count, created_by_user_id, invite_kind, note, revoked) VALUES(?,?,?,?,0,?,?,?,0)",
                id, codeHash, Timestamp.from(expiresAt), maxUses, createdByUserId, inviteKind, note
        );
    }

    public Optional<String> findIdByCodeHash(String codeHash) {
        List<String> ids = jdbc.query(
                "SELECT id FROM registration_invite WHERE code_hash = ? AND revoked = 0 AND expires_at > NOW() AND used_count < max_uses",
                (rs, n) -> rs.getString(1),
                codeHash
        );
        return ids.isEmpty() ? Optional.empty() : Optional.of(ids.get(0));
    }

    /** @return 1 if consumed */
    public int tryConsume(String id) {
        return jdbc.update(
                "UPDATE registration_invite SET used_count = used_count + 1 WHERE id = ? AND revoked = 0 AND expires_at > NOW() AND used_count < max_uses",
                id
        );
    }

    public void revoke(String id) {
        jdbc.update("UPDATE registration_invite SET revoked = 1 WHERE id = ?", id);
    }

    public void revokeActivePersonalByCreator(String createdByUserId) {
        jdbc.update(
                "UPDATE registration_invite SET revoked = 1 WHERE created_by_user_id = ? AND invite_kind = 'PERSONAL' AND revoked = 0 AND used_count < max_uses",
                createdByUserId
        );
    }

    public List<Map<String, Object>> listRecent(int limit) {
        return jdbc.query(
                "SELECT id, expires_at, max_uses, used_count, created_by_user_id, invite_kind, note, revoked, create_time FROM registration_invite ORDER BY create_time DESC LIMIT ?",
                ROW,
                limit
        );
    }
}
