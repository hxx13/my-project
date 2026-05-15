package com.example.demo.modules.invite;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.BadSqlGrammarException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class RegistrationInviteService {

    private static final Logger log = LoggerFactory.getLogger(RegistrationInviteService.class);

    private static final String DDL_HINT =
            "数据库未建 registration_invite 表或表结构不匹配，请在目标库执行 scripts/login_branding_invite_chat.ddl.sql（说明见 scripts/DEPLOY_DDL.md）。";

    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final RegistrationInviteJdbcRepository repo;
    private final String pepper;

    public RegistrationInviteService(RegistrationInviteJdbcRepository repo,
                                       @Value("${app.invite-code-pepper:change-me-in-production}") String pepper) {
        this.repo = repo;
        this.pepper = pepper;
    }

    public String hashOfNormalized(String normalized) {
        return InviteCodeHasher.sha256Hex(pepper, normalized);
    }

    /** 生成可读推荐码（不含易混 0/O、1/I） */
    public String generatePlainCode(int length) {
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            sb.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        }
        return sb.toString();
    }

    /**
     * 写入一条新推荐码；遇 code_hash 唯一冲突（极低概率）自动重试。
     */
    private Map<String, Object> insertInviteWithRetries(
            Instant expiresAt,
            int maxUses,
            String createdByUserId,
            String inviteKind,
            String note
    ) {
        String safeNote = note == null ? "" : note;
        for (int attempt = 0; attempt < 12; attempt++) {
            String plain = generatePlainCode(10);
            String hash = hashOfNormalized(InviteCodeHasher.normalize(plain));
            String id = "INV_" + UUID.randomUUID().toString().replace("-", "");
            try {
                repo.insert(id, hash, expiresAt, maxUses, createdByUserId, inviteKind, safeNote);
                if ("PERSONAL".equals(inviteKind)) {
                    return Map.of("id", id, "plainCode", plain, "expiresAt", expiresAt.toString());
                }
                return Map.of(
                        "id", id,
                        "plainCode", plain,
                        "expiresAt", expiresAt.toString(),
                        "maxUses", maxUses
                );
            } catch (DuplicateKeyException ex) {
                log.debug("[registration-invite] code_hash 冲突，重试生成: {}", ex.getMessage());
            }
        }
        throw new IllegalStateException("生成推荐码失败，请稍后重试");
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createAdminInvite(String createdByUserId, int ttlDays, int maxUses, String note) {
        try {
            Instant exp = Instant.now().plus(ttlDays, ChronoUnit.DAYS);
            return insertInviteWithRetries(exp, maxUses, createdByUserId, "ADMIN", note == null ? "" : note);
        } catch (BadSqlGrammarException ex) {
            log.warn("[registration-invite] 管理端生成时表不可用: {}", ex.getMessage());
            throw new IllegalArgumentException(DDL_HINT);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createPersonalInvite(String staffUserId) {
        try {
            repo.revokeActivePersonalByCreator(staffUserId);
            Instant exp = Instant.now().plus(3, ChronoUnit.DAYS);
            return insertInviteWithRetries(exp, 1, staffUserId, "PERSONAL", "self");
        } catch (BadSqlGrammarException ex) {
            log.warn("[registration-invite] 自助生成时表不可用: {}", ex.getMessage());
            throw new IllegalArgumentException(DDL_HINT);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void consumePlainCodeOrThrow(String plainCode) {
        String norm = InviteCodeHasher.normalize(plainCode);
        if (norm.isEmpty()) {
            throw new IllegalArgumentException("推荐码无效");
        }
        String hash = hashOfNormalized(norm);
        Optional<String> id;
        try {
            id = repo.findIdByCodeHash(hash);
        } catch (BadSqlGrammarException ex) {
            log.warn("[registration-invite] 消费推荐码时表不可用: {}", ex.getMessage());
            throw new IllegalArgumentException("推荐码服务暂不可用，请联系管理员在目标库执行 scripts/login_branding_invite_chat.ddl.sql（见 scripts/DEPLOY_DDL.md）。");
        }
        if (id.isEmpty()) {
            throw new IllegalArgumentException("推荐码无效或已过期");
        }
        int n;
        try {
            n = repo.tryConsume(id.get());
        } catch (BadSqlGrammarException ex) {
            log.warn("[registration-invite] 消费推荐码时表不可用: {}", ex.getMessage());
            throw new IllegalArgumentException("推荐码服务暂不可用，请联系管理员在目标库执行 scripts/login_branding_invite_chat.ddl.sql（见 scripts/DEPLOY_DDL.md）。");
        }
        if (n != 1) {
            throw new IllegalArgumentException("推荐码已用尽或已失效");
        }
    }

    public List<Map<String, Object>> listRecent(int limit) {
        return repo.listRecent(limit);
    }

    /** 管理端列表：缺表时返回空列表并在 schemaHint 中提示执行 DDL（见 scripts/DEPLOY_DDL.md） */
    public InviteAdminListResult listRecentForAdmin(int limit) {
        try {
            return new InviteAdminListResult(repo.listRecent(limit), null);
        } catch (BadSqlGrammarException ex) {
            log.warn("[registration-invite] registration_invite 表不可用: {}", ex.getMessage());
            return new InviteAdminListResult(
                    List.of(),
                    "数据库未建 registration_invite 表，请在目标库执行 scripts/login_branding_invite_chat.ddl.sql（说明见 scripts/DEPLOY_DDL.md）。"
            );
        }
    }

    public void revoke(String id) {
        repo.revoke(id);
    }
}
