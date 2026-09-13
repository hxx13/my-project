package com.example.demo.modules.twin.obligation.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.twin.obligation.entity.TwinQuizBank;
import com.example.demo.modules.twin.obligation.entity.TwinQuizQuestion;
import com.example.demo.modules.twin.obligation.service.QuizBankService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.Data;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 违规「答题」处置策略的题库后台管理。
 *
 * <p>鉴权与 {@code AdminTwinStudentViolationController} 同口径（RoleEnum >= ADMIN）。
 */
@RestController
@RequestMapping("/api/admin/twin/quiz-banks")
@Tag(name = "Twin-Quiz-Bank", description = "违规答题题库管理")
public class AdminQuizBankController {

    private final QuizBankService quizBankService;
    private final AuthContextService authContextService;

    public AdminQuizBankController(QuizBankService quizBankService, AuthContextService authContextService) {
        this.quizBankService = quizBankService;
        this.authContextService = authContextService;
    }

    // ── 题库 ──

    @GetMapping
    @Operation(summary = "题库列表（含题数）")
    public Result<?> listBanks(
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        try {
            List<Map<String, Object>> out = new ArrayList<>();
            for (TwinQuizBank b : quizBankService.listBanks()) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("bankId", b.getBankId());
                m.put("name", b.getName() == null ? "" : b.getName());
                m.put("enabled", b.getEnabled() == null ? 1 : b.getEnabled());
                m.put("questionCount", quizBankService.questionCount(b.getBankId()));
                out.add(m);
            }
            return Result.success(out);
        } catch (Exception e) {
            return Result.error("查询题库失败: " + readableError(e));
        }
    }

    @PostMapping
    @Operation(summary = "新建题库")
    public Result<?> createBank(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody BankBody body
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        if (body == null) {
            return Result.error("缺少请求体");
        }
        try {
            TwinQuizBank b = quizBankService.createBank(body.getBankId(), body.getName());
            return Result.success(bankRow(b));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("创建题库失败: " + readableError(e));
        }
    }

    @PutMapping("/{bankId}")
    @Operation(summary = "编辑题库（改名 / 启停）")
    public Result<?> updateBank(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("bankId") String bankId,
            @RequestBody BankUpdateBody body
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        try {
            quizBankService.updateBank(
                    bankId,
                    body == null ? null : body.getName(),
                    body == null ? null : body.getEnabled());
            return Result.success(bankRowByReload(bankId));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("更新题库失败: " + readableError(e));
        }
    }

    @DeleteMapping("/{bankId}")
    @Operation(summary = "删除题库（默认库不可删；连带删题）")
    public Result<?> deleteBank(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("bankId") String bankId
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        try {
            quizBankService.deleteBank(bankId);
            return Result.success();
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("删除题库失败: " + readableError(e));
        }
    }

    // ── 题目 ──

    @GetMapping("/{bankId}/questions")
    @Operation(summary = "题目列表（含停用题；options 已从 JSON 还原为数组）")
    public Result<?> listQuestions(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("bankId") String bankId
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        try {
            List<Map<String, Object>> out = new ArrayList<>();
            for (TwinQuizQuestion q : quizBankService.listQuestions(bankId)) {
                out.add(questionRow(q));
            }
            return Result.success(out);
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("查询题目失败: " + readableError(e));
        }
    }

    @PostMapping("/{bankId}/questions")
    @Operation(summary = "新建题目")
    public Result<?> createQuestion(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("bankId") String bankId,
            @RequestBody QuestionBody body
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        if (body == null) {
            return Result.error("缺少请求体");
        }
        try {
            TwinQuizQuestion q = quizBankService.createQuestion(
                    bankId, body.getPrompt(), body.getOptions(), body.getCorrectIndex());
            return Result.success(questionRow(q));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("创建题目失败: " + readableError(e));
        }
    }

    @PutMapping("/questions/{id}")
    @Operation(summary = "编辑题目")
    public Result<?> updateQuestion(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") long id,
            @RequestBody QuestionBody body
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        if (body == null) {
            return Result.error("缺少请求体");
        }
        try {
            TwinQuizQuestion q = quizBankService.updateQuestion(
                    id, body.getPrompt(), body.getOptions(), body.getCorrectIndex(), body.getEnabled());
            return Result.success(questionRow(q));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("更新题目失败: " + readableError(e));
        }
    }

    @DeleteMapping("/questions/{id}")
    @Operation(summary = "删除题目")
    public Result<?> deleteQuestion(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") long id
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) {
            return denied;
        }
        try {
            quizBankService.deleteQuestion(id);
            return Result.success();
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("删除题目失败: " + readableError(e));
        }
    }

    // ── 内部 ──

    private Map<String, Object> bankRow(TwinQuizBank b) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("bankId", b.getBankId());
        m.put("name", b.getName() == null ? "" : b.getName());
        m.put("enabled", b.getEnabled() == null ? 1 : b.getEnabled());
        m.put("questionCount", quizBankService.questionCount(b.getBankId()));
        return m;
    }

    /** 更新后重新读库回显（updateBank 不返回实体）。 */
    private Map<String, Object> bankRowByReload(String bankId) {
        for (TwinQuizBank b : quizBankService.listBanks()) {
            if (b != null && b.getBankId() != null && b.getBankId().equals(bankId == null ? null : bankId.trim())) {
                return bankRow(b);
            }
        }
        return null;
    }

    private Map<String, Object> questionRow(TwinQuizQuestion q) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", q.getId());
        m.put("prompt", q.getPrompt());
        m.put("options", quizBankService.optionsOf(q));
        m.put("correctIndex", q.getCorrectIndex());
        m.put("enabled", q.getEnabled() == null ? 1 : q.getEnabled());
        m.put("sortOrder", q.getSortOrder());
        return m;
    }

    private Result<?> requireAdmin(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return Result.error("未登录或令牌无效");
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            return Result.error("账号已禁用");
        }
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.MEMBER;
        if (role.getLevel() < RoleEnum.ADMIN.getLevel()) {
            return Result.error("无权限访问（需管理员及以上）");
        }
        return null;
    }

    private String readableError(Throwable throwable) {
        Throwable cur = throwable;
        while (cur.getCause() != null) {
            cur = cur.getCause();
        }
        String msg = cur.getMessage();
        if (msg == null || msg.isBlank()) {
            msg = throwable.getMessage();
        }
        if (msg == null || msg.isBlank()) {
            return "未知错误";
        }
        return msg.length() > 500 ? msg.substring(0, 500) : msg;
    }

    @Data
    public static class BankBody {
        private String bankId;
        private String name;
    }

    @Data
    public static class BankUpdateBody {
        private String name;
        private Integer enabled;
    }

    @Data
    public static class QuestionBody {
        private String prompt;
        private List<String> options;
        private Integer correctIndex;
        private Integer enabled;
    }
}
