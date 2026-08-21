package com.example.demo.modules.identity.config;

import com.example.demo.modules.identity.entity.PersonIdentityTag;
import com.example.demo.modules.identity.mapper.PersonIdentityTagMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 内置默认身份标签种子（组长/秘书/专家）。
 *
 * <p>背景：{@code person_identity_tag} 此前「无种子、管理员手动配置」，但 AUP 鉴权
 * （{@code AupAccessPolicy}）按 code（GROUP_LEADER/SECRETARY/EXPERT）动态判定组长/秘书/专家，
 * 管理员若手动建错 code 会导致 AUP 鉴权失效。本启动器在启动时幂等补齐三个默认标签。
 *
 * <p>幂等：按 code 先查再插，已存在即跳过（不覆盖管理员后续自定义的 label/sortOrder）；
 * 并发下撞唯一键由 {@link DuplicateKeyException} 兜底。表缺失等异常仅 log warn，不阻塞启动。
 * 启动顺序：DDL 建表在 {@code EmbeddedTwinSystemCoreDdlBootstrap#afterPropertiesSet}
 * （{@code InitializingBean} 早期）完成，早于本 {@code ApplicationRunner#run}，故表已就绪。
 */
@Component
@Order(126) // 晚于 DDL bootstrap（InitializingBean 早期建表），与其他业务种子同段
public class PersonIdentityTagSeedBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(PersonIdentityTagSeedBootstrap.class);

    private final PersonIdentityTagMapper tagMapper;
    private final JdbcTemplate jdbcTemplate;

    @Value("${person.identity.seed.pi-code:PI}")
    private String piCode;
    @Value("${person.identity.seed.pi-label:PI}")
    private String piLabel;

    @Value("${person.identity.seed.secretary-code:SECRETARY}")
    private String secretaryCode;
    @Value("${person.identity.seed.secretary-label:秘书}")
    private String secretaryLabel;

    @Value("${person.identity.seed.expert-code:EXPERT}")
    private String expertCode;
    @Value("${person.identity.seed.expert-label:专家}")
    private String expertLabel;

    public PersonIdentityTagSeedBootstrap(PersonIdentityTagMapper tagMapper, JdbcTemplate jdbcTemplate) {
        this.tagMapper = tagMapper;
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            int created = 0;
            created += seed("LAB_MEMBER", "实验员", 1);
            created += seed(piCode, piLabel, 2);
            created += seed("BREEDING_GROUP_LEADER", "饲养组长", 3);
            created += seed("BREEDER", "饲养员", 4);
            created += seed(secretaryCode, secretaryLabel, 5);
            created += seed(expertCode, expertLabel, 6);
            created += seed("DEPUTY_DIRECTOR", "副主任", 7);
            created += seed("DIRECTOR", "主任", 8);
            created += seed("VETERINARIAN", "兽医", 9);
            created += seed("GROUP_STEWARD", "课题组管家", 10);
            // 默认「实验员」：给所有无身份标识的人员补 LAB_MEMBER 标签（幂等，key=personnel.id）
            try {
                int assigned = jdbcTemplate.update(
                        "INSERT INTO person_identity (user_id, tag_id) " +
                                "SELECT CAST(p.id AS CHAR), t.id FROM personnel p " +
                                "JOIN person_identity_tag t ON t.code = 'LAB_MEMBER' " +
                                "AND NOT EXISTS (SELECT 1 FROM person_identity pi WHERE pi.user_id = CAST(p.id AS CHAR))");
                if (assigned > 0) log.info("[person-identity-seed] 默认实验员身份已补齐 {} 人", assigned);
            } catch (Exception e) {
                log.warn("[person-identity-seed] 默认实验员身份初始化失败: {}", e.getMessage());
            }
            log.info("[person-identity-seed] 默认身份标签就绪（本次新增 {} 条）", created);
        } catch (Exception e) {
            log.warn("[person-identity-seed] 默认身份标签初始化失败: {}", e.getMessage());
        }
    }

    /** 单条种子：按 code 查，不存在则插入；已存在跳过（不改动管理员后续自定义的 label/sortOrder）。 */
    private int seed(String code, String label, int sortOrder) {
        if (code == null || code.isBlank()) {
            return 0;
        }
        String c = code.trim();
        try {
            if (tagMapper.findByCode(c) != null) {
                return 0;
            }
            PersonIdentityTag tag = new PersonIdentityTag();
            tag.setCode(c);
            tag.setLabel(label == null || label.isBlank() ? c : label.trim());
            tag.setSortOrder(sortOrder);
            tag.setActive(1);
            tagMapper.insert(tag);
            return 1;
        } catch (DuplicateKeyException e) {
            log.info("[person-identity-seed] 标签已存在（并发插入），跳过: {}", c);
            return 0;
        }
    }
}
