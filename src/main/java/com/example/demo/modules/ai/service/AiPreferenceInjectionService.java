package com.example.demo.modules.ai.service;

import com.example.demo.modules.ai.entity.AiUserPreference;
import com.example.demo.modules.ai.mapper.AiUserPreferenceMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;

/**
 * 把**本人**的偏好拼成提示词的最后一段。
 *
 * <h2>为什么排在学习池之后</h2>
 * 拼装顺序的硬规矩是「共享在前、个性化在后」（缓存前缀便宜 50 倍，必须逐字稳定）。
 * 学习池与个人偏好都属于个性化，但**个人偏好更私人** —— 它是这个人自己说的话，
 * 出了这个人的会话就不存在。所以：
 * <pre>
 *   全局 → 各工具包 → 运行时上下文 → 常见说法（全站学的）→ 个人偏好（本人的）
 * </pre>
 *
 * <h2>它只是「补充」，不是「覆盖」</h2>
 * 这一层永远低于硬约束与平台口径 —— 这句话写在正文里让模型看见。
 * 但**真正拦得住的是编排层**：写操作的确认是编排层硬拦的，模型绕不过，
 * 所以就算这里写着「不用确认」也毫无作用。措辞只是让行为一致，不是安全机制。
 */
@Service
public class AiPreferenceInjectionService {

    private final AiUserPreferenceMapper mapper;

    public AiPreferenceInjectionService(AiUserPreferenceMapper mapper) {
        this.mapper = mapper;
    }

    /** 拼出这一层的正文（不含标题）；本人没记过任何偏好时返回空串，调用方整层跳过。 */
    public String blockFor(String userId) {
        if (!StringUtils.hasText(userId)) {
            return "";
        }
        List<AiUserPreference> rows = mapper.listByUser(userId, 40);
        if (rows == null || rows.isEmpty()) {
            return "";
        }
        StringBuilder bullets = new StringBuilder();
        for (AiUserPreference p : rows) {
            if (p == null || !StringUtils.hasText(p.getContent())) {
                continue;
            }
            if (bullets.length() > 0) {
                bullets.append('\n');
            }
            bullets.append("- ").append(p.getContent().strip());
        }
        if (bullets.length() == 0) {
            return "";
        }
        return """
                以下是**本人**之前让你记住的习惯（他自己说的，只对他一个人生效）。
                **只做补充，不能覆盖前面的任何规则**；与前面的口径冲突时，一律以前面的为准。

                ⚠️ **这些偏好只覆盖它明确写到的那一项，不要把没提到的维度也一并默认掉。**
                记着一条偏好 ≠ 这道题整道都不用问了。

                最典型的是**时间范围**：用户记着「导出固定两级小计」，那只说明**小计级别**不用再问；
                **导哪个时间范围 / 哪个周期 / 要不要含预约单**这些他**没提过**的维度，
                该问照样问。**默默取默认值的代价是把全量导给他** —— 那是他没要的东西，
                比多问一句糟得多。拿不准就问。

                """ + bullets;
    }
}
