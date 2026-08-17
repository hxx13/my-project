package com.example.demo.modules.institution.config;

import com.example.demo.modules.institution.entity.Institution;
import com.example.demo.modules.institution.mapper.InstitutionMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Component;

/**
 * 默认院校字典种子（校内 / 附属医院 / 其他科研机构），code/name 由环境变量可配。
 * 幂等：按 code 先查再插，已存在即跳过；并发撞唯一键由 DuplicateKeyException 兜底。
 */
@Component
@Order(127)
public class InstitutionSeedBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(InstitutionSeedBootstrap.class);

    private final InstitutionMapper institutionMapper;

    @Value("${institution.seed.inside-code:INSIDE}")
    private String insideCode;
    @Value("${institution.seed.inside-name:校内机构}")
    private String insideName;

    @Value("${institution.seed.hospital-code:HOSPITAL}")
    private String hospitalCode;
    @Value("${institution.seed.hospital-name:附属医院}")
    private String hospitalName;

    @Value("${institution.seed.other-code:OTHER}")
    private String otherCode;
    @Value("${institution.seed.other-name:其他科研机构}")
    private String otherName;

    public InstitutionSeedBootstrap(InstitutionMapper institutionMapper) {
        this.institutionMapper = institutionMapper;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            int created = 0;
            created += seed(insideCode, insideName, "INSIDE", 1);
            created += seed(hospitalCode, hospitalName, "HOSPITAL", 2);
            created += seed(otherCode, otherName, "OTHER", 3);
            log.info("[institution-seed] 默认院校就绪（本次新增 {} 条）", created);
        } catch (Exception e) {
            log.warn("[institution-seed] 默认院校初始化失败: {}", e.getMessage());
        }
    }

    private int seed(String code, String name, String type, int sortOrder) {
        if (code == null || code.isBlank()) {
            return 0;
        }
        String c = code.trim();
        try {
            if (institutionMapper.findByCode(c) != null) {
                return 0;
            }
            Institution inst = new Institution();
            inst.setCode(c);
            inst.setName(name == null || name.isBlank() ? c : name.trim());
            inst.setType(type);
            inst.setSortOrder(sortOrder);
            inst.setActive(1);
            institutionMapper.insert(inst);
            return 1;
        } catch (DuplicateKeyException e) {
            log.info("[institution-seed] 院校已存在（并发插入），跳过: {}", c);
            return 0;
        }
    }
}
