package com.example.demo.modules.training.service;

import com.example.demo.modules.training.entity.Training;
import com.example.demo.modules.training.entity.TrainingCertificate;
import com.example.demo.modules.training.entity.TrainingEnrollment;
import com.example.demo.modules.training.entity.TrainingOccurrence;
import com.example.demo.modules.training.mapper.TrainingCertificateMapper;
import com.example.demo.modules.training.mapper.TrainingEnrollmentMapper;
import com.example.demo.modules.training.mapper.TrainingMapper;
import com.example.demo.modules.training.mapper.TrainingOccurrenceMapper;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 培训证书：报名「审批 + 评分双通过」时按培训类型发证，发证即快照
 * （姓名/培训日期/培训者签字/模板版本都存当时的值，之后培训或试卷删改都不影响已发证书）。
 *
 * 证书正文与版本见 {@link CertificateTemplates}（唯一来源），这里只负责发证与查询。
 */
@Service
public class TrainingCertificateService {

    private final TrainingCertificateMapper certMapper;
    private final TrainingEnrollmentMapper enrollmentMapper;
    private final TrainingOccurrenceMapper occurrenceMapper;
    private final TrainingMapper trainingMapper;
    /** 姓名解析：报名的 name 字段在自助报名时可能退化成原始 id，发证要按人员表解出真名 */
    private final UserDisplayNameService displayNameService;
    private final ObjectMapper objectMapper;

    public TrainingCertificateService(TrainingCertificateMapper certMapper,
                                      TrainingEnrollmentMapper enrollmentMapper,
                                      TrainingOccurrenceMapper occurrenceMapper,
                                      TrainingMapper trainingMapper,
                                      UserDisplayNameService displayNameService,
                                      ObjectMapper objectMapper) {
        this.certMapper = certMapper;
        this.enrollmentMapper = enrollmentMapper;
        this.occurrenceMapper = occurrenceMapper;
        this.trainingMapper = trainingMapper;
        this.displayNameService = displayNameService;
        this.objectMapper = objectMapper;
    }

    /**
     * 发证规则：**每个培训固定发一对** —— 设施准入现场培训记录 + 二氧化碳安乐死培训记录
     * （与培训主题无关，用户 2026-09-23 定的口径）。
     * 唯一键 (enrollment_id, template_key) 保证重复发证幂等。
     */
    private static final List<String> CERT_KEYS = List.of(
            CertificateTemplates.T_FACILITY,
            CertificateTemplates.T_EUTHANASIA);

    /** 双通过即发证（一对）；不满足条件或已发过则安静跳过。返回本次新增张数。 */
    @Transactional
    public int issueForEnrollment(Long enrollmentId) {
        TrainingEnrollment e = enrollmentMapper.findById(enrollmentId);
        if (e == null) return 0;
        if (!Integer.valueOf(1).equals(e.getTestYn()) || !Integer.valueOf(1).equals(e.getTestFraction())) return 0;
        TrainingOccurrence o = occurrenceMapper.findById(e.getOccurrenceId());
        if (o == null) return 0;
        Training t = trainingMapper.findById(o.getTrainingId());
        if (t == null) return 0;

        int issued = 0;
        // 姓名：按人员表解析真名（自助报名存进 enrollment.name 的可能只是原始 id）
        String personName = resolveRealName(e.getTraineeId());
        if (!StringUtils.hasText(personName)) {
            personName = StringUtils.hasText(e.getName()) ? e.getName() : e.getTraineeId();
        }
        // 培训者签字：场次培训老师（ARO 同步来的 examinerName）→ 培训所属人 → 兜底「饲养组长」。
        // 用户口径（2026-09-23）：没有所属人就落饲养组长。
        String trainerName = o.getExaminerName();
        if (!StringUtils.hasText(trainerName)) {
            trainerName = resolveRealName(firstOwnerId(t.getOwnerIdsJson()));
        }
        if (!StringUtils.hasText(trainerName)) {
            trainerName = DEFAULT_TRAINER_NAME;
        }
        for (String key : CERT_KEYS) {
            if (certMapper.exists(enrollmentId, key) > 0) continue;
            TrainingCertificate c = new TrainingCertificate();
            c.setPersonId(e.getTraineeId());
            c.setPersonName(personName);
            c.setTemplateKey(key);
            c.setTemplateVersion(CertificateTemplates.versionOf(key));
            c.setTrainingId(t.getId());
            c.setTrainingName(t.getName());
            c.setOccurrenceId(o.getId());
            c.setEnrollmentId(enrollmentId);
            c.setTrainingDate(o.getStartTime() != null ? o.getStartTime().toLocalDate() : null);
            c.setTrainerName(trainerName);
            issued += certMapper.insertIfAbsent(c);
        }
        return issued;
    }

    /** 培训者签字的兜底署名：场次没有培训老师、培训也没有所属人时用这个。 */
    private static final String DEFAULT_TRAINER_NAME = "饲养组长";

    /** owner_ids_json → 第一个所属人 id；空/解析失败返回 null。 */
    private String firstOwnerId(String ownerIdsJson) {
        if (ownerIdsJson == null || ownerIdsJson.isBlank()) return null;
        try {
            Object o = objectMapper.readValue(ownerIdsJson, Object.class);
            if (o instanceof List<?> list && !list.isEmpty() && list.get(0) != null) {
                String s = String.valueOf(list.get(0)).trim();
                return s.isEmpty() ? null : s;
            }
        } catch (Exception ignore) {
            // 解析失败就当没有所属人
        }
        return null;
    }

    /** 解析成真名才认；解析不出来（返回的仍是 id）视作没有。 */
    private String resolveRealName(String id) {
        if (!StringUtils.hasText(id)) return null;
        String name = displayNameService.resolveDisplayName(id);
        return StringUtils.hasText(name) && !name.equals(id.trim()) ? name : null;
    }

    /** 补发历史证书：这个人所有已双通过的报名，缺哪张补哪张。幂等。 */
    @Transactional
    public int backfillForPerson(String personId) {
        int n = 0;
        for (Long id : certMapper.listFullyPassedEnrollmentIds(personId)) {
            n += issueForEnrollment(id);
        }
        return n;
    }

    /** 我的证书（发证即快照，读取时不再回查培训/试卷）。 */
    public List<Map<String, Object>> listByPerson(String personId) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (TrainingCertificate c : certMapper.listByPerson(personId)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", c.getId());
            m.put("templateKey", c.getTemplateKey());
            m.put("templateVersion", c.getTemplateVersion());
            m.put("personName", c.getPersonName());
            m.put("trainingId", c.getTrainingId());
            m.put("trainingName", c.getTrainingName());
            m.put("enrollmentId", c.getEnrollmentId());
            m.put("trainingDate", c.getTrainingDate());
            m.put("trainerName", c.getTrainerName());
            m.put("issuedAt", c.getIssuedAt());
            out.add(m);
        }
        return out;
    }

    /** 单张证书（PDF 出件前做归属校验用）。 */
    public TrainingCertificate findById(Long id) {
        return certMapper.findById(id);
    }
}
