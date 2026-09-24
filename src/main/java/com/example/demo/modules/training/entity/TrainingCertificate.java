package com.example.demo.modules.training.entity;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** 培训证书（发证即快照：之后培训/试卷删改都不影响已发证书）。 */
@Data
public class TrainingCertificate {
    private Long id;
    private String personId;
    private String personName;
    private String templateKey;
    private String templateVersion;
    private Long trainingId;
    private String trainingName;
    private Long occurrenceId;
    private Long enrollmentId;
    private LocalDate trainingDate;
    private String trainerName;
    private LocalDateTime issuedAt;

    /**
     * 证书编号：由 id 派生（唯一且永久稳定），列表与 PDF 都调这一处。
     * 别在客户端另算一份，否则网页显示与实物会不同号。
     */
    public String certNo() {
        if (id == null) return "";
        int year = issuedAt != null ? issuedAt.getYear()
                : trainingDate != null ? trainingDate.getYear()
                : LocalDate.now().getYear();
        return String.format("SHSMU-%d-%06d", year, id);
    }
}
