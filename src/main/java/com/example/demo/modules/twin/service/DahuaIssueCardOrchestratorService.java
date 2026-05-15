package com.example.demo.modules.twin.service;

import com.example.demo.modules.dahua.service.DahuaOpenApiService;
import com.example.demo.modules.twin.dto.DahuaIssueCardRequest;
import com.example.demo.modules.twin.dto.DahuaIssueCardResponse;
import com.example.demo.modules.twin.dto.DahuaIssueStepResult;
import com.example.demo.modules.twin.entity.TwinCardMapping;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.util.UriUtils;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
public class DahuaIssueCardOrchestratorService {
    private static final Logger log = LoggerFactory.getLogger(DahuaIssueCardOrchestratorService.class);
    private static final DateTimeFormatter CODE_DATE = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final int BATCH_AUTHORITY_SYNC_RETRY_TIMES = 6;
    private static final long BATCH_AUTHORITY_SYNC_RETRY_BASE_MS = 400L;
    private static final int CARD_ACTIVE_RETRY_TIMES = 4;
    private static final long CARD_ACTIVE_RETRY_BASE_MS = 600L;

    private final DahuaOpenApiService dahuaOpenApiService;
    private final TwinCardMappingService mappingService;

    public DahuaIssueCardOrchestratorService(DahuaOpenApiService dahuaOpenApiService,
                                             TwinCardMappingService mappingService) {
        this.dahuaOpenApiService = dahuaOpenApiService;
        this.mappingService = mappingService;
    }

    @Transactional(rollbackFor = Exception.class)
    public DahuaIssueCardResponse issue(DahuaIssueCardRequest req) {
        DahuaIssueCardResponse response = new DahuaIssueCardResponse();
        validateRequest(req);
        if (mappingService.getByCardNo(req.getCardNo()) != null) {
            throw new RuntimeException("该物理卡号已被绑定，请勿重复录入！");
        }

        log.info("[dahua-issue] start userName={} aroUserId={} cardNo={}", req.getUserName(), req.getAroUserId(), req.getCardNo());

        // 先在大华侧确认卡号未被占用，再生成人员，避免「卡重复」时已在平台多建人员
        executePreflightCardNumberAvailable(req, response);
        // 卡片主键先申请（卡号维度唯一），人员可重复，故人员步骤放在其后
        Long cardId = executeGenerateCardId(response);

        Long personId = executeGenerateId(response);
        String personCode = LocalDate.now().format(CODE_DATE) + personId;
        response.setPersonId(personId);
        response.setPersonCode(personCode);

        executeAddPerson(req, personId, personCode, response);
        executeBatchAuthority(req, personCode, response);
        boolean cardAddedWithGeneratedId = executeAddCard(req, cardId, personId, response);
        executeCardActivation(req, cardId, personId, response, cardAddedWithGeneratedId);
        executeLocalMapping(req, personId, response);

        response.setSuccess(true);
        log.info("[dahua-issue] success personId={} cardNo={}", personId, req.getCardNo());
        return response;
    }

    private void validateRequest(DahuaIssueCardRequest req) {
        if (req == null) throw new RuntimeException("请求参数不能为空");
        if (isBlank(req.getUserName())) throw new RuntimeException("请选择人员");
        if (isBlank(req.getCardNo())) throw new RuntimeException("物理卡号不能为空");
        if (req.getDepartmentId() == null) throw new RuntimeException("部门不能为空");
    }

    /**
     * 大华文档：GET /evo-apigw/evo-brm/1.0.0/card/{cardNumber}
     * 成功且 data.id 存在 → 卡已登记，禁止继续（否则后面会重复建人）。
     * 失败且 code=28140001 或 errMsg 含「卡号不存在」→ 可继续发卡。
     */
    private void executePreflightCardNumberAvailable(DahuaIssueCardRequest req, DahuaIssueCardResponse response) {
        String step = "preflight-card-query";
        String cardNo = req.getCardNo().trim();
        String path = "/evo-apigw/evo-brm/1.0.0/card/" + UriUtils.encodePathSegment(cardNo, StandardCharsets.UTF_8);
        log.info("[dahua-issue][{}] GET {}", step, path);
        Map<String, Object> resp = dahuaOpenApiService.getRaw(path);
        if (dahuaOpenApiService.isSuccess(resp)) {
            Map<String, Object> data = DahuaOpenApiService.asMap(resp.get("data"));
            if (data != null && data.get("id") != null) {
                throw buildStepFailure(step, resp, response,
                        "该物理卡号已在大华平台登记，请换卡或先在平台解绑/注销后再绑定");
            }
            addSuccessStep(response, step, resp, "卡号查询：平台无此卡记录，可继续");
            return;
        }
        String code = String.valueOf(resp.getOrDefault("code", ""));
        String err = extractErrMsg(resp);
        if ("28140001".equals(code) || err.contains("卡号不存在") || err.contains("不存在")) {
            addSuccessStep(response, step, resp, "卡号未在大华平台登记，可继续");
            return;
        }
        throw buildStepFailure(step, resp, response, "无法确认卡号是否可用，请稍后重试");
    }

    private Long executeGenerateId(DahuaIssueCardResponse response) {
        String step = "generate-person-id";
        log.info("[dahua-issue][{}] start", step);
        Map<String, Object> resp = dahuaOpenApiService.getRaw("/evo-apigw/evo-brm/1.0.0/person/generate-id");
        if (!dahuaOpenApiService.isSuccess(resp)) {
            throw buildStepFailure(step, resp, response);
        }
        Long personId = DahuaOpenApiService.parseLong(DahuaOpenApiService.asMap(resp.get("data")).get("id"));
        if (personId == null) {
            throw buildStepFailure(step, resp, response, "上游未返回人员ID");
        }
        addSuccessStep(response, step, resp, "已生成人员ID: " + personId);
        return personId;
    }

    private void executeAddPerson(DahuaIssueCardRequest req, Long personId, String personCode, DahuaIssueCardResponse response) {
        String step = "person-add";
        log.info("[dahua-issue][{}] start personId={} personCode={}", step, personId, personCode);
        Map<String, Object> body = new HashMap<>();
        body.put("service", "evo-thirdParty");
        body.put("id", personId);
        body.put("name", req.getUserName());
        body.put("code", personCode);
        body.put("paperType", -1);
        body.put("paperNumber", "");
        body.put("departmentId", req.getDepartmentId());
        body.put("departmentList", List.of(Map.of("departmentId", req.getDepartmentId(), "departmentType", 1)));
        body.put("personBiosignatures", Collections.emptyList());

        Map<String, Object> resp = dahuaOpenApiService.postRaw("/evo-apigw/evo-brm/1.2.0/person/subsystem/add", body);
        if (!dahuaOpenApiService.isSuccess(resp)) {
            throw buildStepFailure(step, resp, response);
        }
        addSuccessStep(response, step, resp, "人员新增成功");
    }

    private void executeBatchAuthority(DahuaIssueCardRequest req, String personCode, DahuaIssueCardResponse response) {
        String step = "batch-authority";
        log.info("[dahua-issue][{}] start personCode={}", step, personCode);
        List<Map<String, Object>> privilegeDetails = new ArrayList<>();
        if (req.getChannelResourceCodes() != null) {
            for (String channelCode : req.getChannelResourceCodes()) {
                if (isBlank(channelCode)) continue;
                privilegeDetails.add(Map.of(
                        "privilegeType", 1,
                        "timeQuantumId", 1,
                        "resourceCode", channelCode
                ));
            }
        }
        if (req.getDoorGroupIds() != null) {
            for (Long doorGroupId : req.getDoorGroupIds()) {
                if (doorGroupId == null) continue;
                privilegeDetails.add(Map.of(
                        "privilegeType", 2,
                        "timeQuantumId", 1,
                        "resourceCode", String.valueOf(doorGroupId)
                ));
            }
        }
        if (privilegeDetails.isEmpty()) {
            log.info("[dahua-issue][{}] skip: no channels or door groups", step);
            addSuccessStep(response, step, null, "未配置通道/门组，跳过批量授权");
            return;
        }
        Map<String, Object> body = new HashMap<>();
        body.put("personCodes", Collections.singletonList(personCode));
        body.put("timeQuantumId", 1);
        body.put("privilegeDetails", privilegeDetails);
        Map<String, Object> resp = null;
        for (int attempt = 1; attempt <= BATCH_AUTHORITY_SYNC_RETRY_TIMES; attempt++) {
            resp = dahuaOpenApiService.postRaw(
                    "/evo-apigw/evo-accesscontrol/1.0.0/card/accessControl/personAuthority/batchAuthority",
                    body
            );
            if (dahuaOpenApiService.isSuccess(resp)) {
                addSuccessStep(response, step, resp, attempt == 1 ? "批量授权成功" : "批量授权成功(重试第" + attempt + "次)");
                return;
            }
            if (!isPersonSyncDelayError(resp) || attempt == BATCH_AUTHORITY_SYNC_RETRY_TIMES) {
                break;
            }
            long sleepMs = BATCH_AUTHORITY_SYNC_RETRY_BASE_MS * attempt;
            log.warn("[dahua-issue][{}] person not synced yet, retry attempt={}/{}, wait={}ms, err={}",
                    step, attempt, BATCH_AUTHORITY_SYNC_RETRY_TIMES, sleepMs, extractErrMsg(resp));
            try {
                Thread.sleep(sleepMs);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw buildStepFailure(step, resp, response, "批量授权等待同步时被中断");
            }
        }
        if (isPersonSyncDelayError(resp)) {
            throw buildStepFailure(step, resp, response, "人员创建成功，但尚未同步至权限系统，请稍后重试");
        }
        throw buildStepFailure(step, resp, response);
    }

    /**
     * 激活卡片。部分平台在 card/add 后已为「可用/已激活」态，再调 active 会报
     * card status not support this operation —— 此类视为可跳过并继续落库。
     * cardAddedWithGeneratedId=true 时附带 id（与本次 generate-id 一致）；若 card/add 因「已存在」跳过，
     * 则不要带错误的主键 id，仅按卡号+人员激活。
     */
    private void executeCardActivation(DahuaIssueCardRequest req, Long cardId, Long personId,
                                       DahuaIssueCardResponse response, boolean cardAddedWithGeneratedId) {
        String step = "card-active";
        log.info("[dahua-issue][{}] start cardNo={} personId={} cardId={} useIdInBody={}",
                step, req.getCardNo(), personId, cardId, cardAddedWithGeneratedId);
        LocalDateTime start = LocalDateTime.of(LocalDate.now(), LocalTime.MIN);
        LocalDateTime end = LocalDateTime.of(LocalDate.now().plusYears(10), LocalTime.of(23, 59, 59));
        Map<String, Object> body = new HashMap<>();
        if (cardAddedWithGeneratedId && cardId != null) {
            body.put("id", cardId);
        }
        body.put("cardNumber", req.getCardNo());
        body.put("personId", personId);
        body.put("departmentId", req.getDepartmentId());
        body.put("cardPassword", null);
        body.put("passwordKey", null);
        body.put("startDate", DahuaOpenApiService.formatDateTime(start));
        body.put("endDate", DahuaOpenApiService.formatDateTime(end));
        body.put("availableTimes", null);
        body.put("category", String.valueOf(req.getCardCategory() == null ? 0 : req.getCardCategory()));

        if (cardAddedWithGeneratedId) {
            try {
                Thread.sleep(400);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw buildStepFailure(step, null, response, "激活前等待被中断");
            }
        }

        Map<String, Object> lastResp = null;
        for (int attempt = 1; attempt <= CARD_ACTIVE_RETRY_TIMES; attempt++) {
            lastResp = dahuaOpenApiService.putRaw("/evo-apigw/evo-brm/1.0.0/card/active", body);
            if (dahuaOpenApiService.isSuccess(lastResp)) {
                addSuccessStep(response, step, lastResp, attempt == 1 ? "卡片激活成功" : "卡片激活成功(第" + attempt + "次重试)");
                return;
            }
            if (isCardActivationSkippableUpstreamError(lastResp)) {
                log.warn("[dahua-issue][{}] skip: platform reports state not applicable (often already active). err={}",
                        step, extractErrMsg(lastResp));
                addSuccessStep(response, step, lastResp, "跳过激活：卡片已是可用/已激活态或平台不允许重复激活");
                return;
            }
            if (attempt < CARD_ACTIVE_RETRY_TIMES) {
                long sleepMs = CARD_ACTIVE_RETRY_BASE_MS * attempt;
                log.warn("[dahua-issue][{}] activate failed attempt={}/{}, wait={}ms, err={}",
                        step, attempt, CARD_ACTIVE_RETRY_TIMES, sleepMs, extractErrMsg(lastResp));
                try {
                    Thread.sleep(sleepMs);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw buildStepFailure(step, lastResp, response, "激活重试等待被中断");
                }
            }
        }
        // 带 id 仍失败时，再试一次不传 id（部分环境 active 仅认卡号）
        if (cardAddedWithGeneratedId && cardId != null && body.containsKey("id")) {
            Map<String, Object> bodyWithoutId = new HashMap<>(body);
            bodyWithoutId.remove("id");
            log.info("[dahua-issue][{}] fallback: PUT active without id", step);
            Map<String, Object> respFallback = dahuaOpenApiService.putRaw("/evo-apigw/evo-brm/1.0.0/card/active", bodyWithoutId);
            if (dahuaOpenApiService.isSuccess(respFallback)) {
                addSuccessStep(response, step, respFallback, "卡片激活成功(兼容：未传卡片主键)");
                return;
            }
            if (isCardActivationSkippableUpstreamError(respFallback)) {
                addSuccessStep(response, step, respFallback, "跳过激活：卡片已是可用/已激活态或平台不允许重复激活");
                return;
            }
            lastResp = respFallback;
        }
        throw buildStepFailure(step, lastResp, response);
    }

    private Long executeGenerateCardId(DahuaIssueCardResponse response) {
        String step = "generate-card-id";
        log.info("[dahua-issue][{}] start", step);
        Map<String, Object> resp = dahuaOpenApiService.getRaw("/evo-apigw/evo-brm/1.0.0/card/generate-id");
        if (!dahuaOpenApiService.isSuccess(resp)) {
            throw buildStepFailure(step, resp, response);
        }
        Long cardId = DahuaOpenApiService.parseLong(DahuaOpenApiService.asMap(resp.get("data")).get("id"));
        if (cardId == null) {
            throw buildStepFailure(step, resp, response, "上游未返回卡片ID");
        }
        addSuccessStep(response, step, resp, "已生成卡片ID: " + cardId);
        return cardId;
    }

    /**
     * @return true 表示本次用 generate 的 cardId 成功执行了 add；false 表示因「卡片已存在」等跳过新增（勿把 generate 的 id 用于激活）
     */
    private boolean executeAddCard(DahuaIssueCardRequest req, Long cardId, Long personId, DahuaIssueCardResponse response) {
        String step = "card-add";
        log.info("[dahua-issue][{}] start cardId={} cardNo={} personId={}", step, cardId, req.getCardNo(), personId);
        LocalDateTime start = LocalDateTime.of(LocalDate.now(), LocalTime.MIN);
        LocalDateTime end = LocalDateTime.of(LocalDate.now().plusYears(10), LocalTime.of(23, 59, 59));
        String category = String.valueOf(req.getCardCategory() == null ? 0 : req.getCardCategory());

        Map<String, Object> body = new HashMap<>();
        body.put("id", cardId);
        body.put("cardNumber", req.getCardNo());
        body.put("category", category);
        body.put("cardType", "0");
        body.put("startDate", DahuaOpenApiService.formatDateTime(start));
        body.put("endDate", DahuaOpenApiService.formatDateTime(end));
        body.put("personId", personId);
        body.put("departmentId", req.getDepartmentId());
        body.put("availableTimes", null);

        Map<String, Object> resp = dahuaOpenApiService.postRaw("/evo-apigw/evo-brm/1.0.0/card/add", body);
        if (!dahuaOpenApiService.isSuccess(resp)) {
            if (isCardAlreadyExistsError(resp)) {
                addSuccessStep(response, step, resp, "卡片已存在，跳过新增继续激活");
                return false;
            }
            throw buildStepFailure(step, resp, response);
        }
        addSuccessStep(response, step, resp, "卡片新增成功");
        return true;
    }

    private void executeLocalMapping(DahuaIssueCardRequest req, Long personId, DahuaIssueCardResponse response) {
        String step = "local-save";
        log.info("[dahua-issue][{}] start cardNo={} aroUserId={}", step, req.getCardNo(), req.getAroUserId());
        TwinCardMapping mapping = new TwinCardMapping();
        mapping.setCardNo(req.getCardNo());
        mapping.setDahuaSeq(String.valueOf(personId));
        mapping.setDahuaPersonCode(response.getPersonCode());
        mapping.setAroUserId(req.getAroUserId());
        mapping.setCardStatus("NORMAL");
        mapping.setFreezeExemptFlag(0);
        mappingService.addMapping(mapping);

        DahuaIssueStepResult r = new DahuaIssueStepResult();
        r.setStepName(step);
        r.setSuccess(true);
        r.setMessage("本地映射落库成功");
        response.getSteps().add(r);
    }

    private RuntimeException buildStepFailure(String step, Map<String, Object> resp, DahuaIssueCardResponse response) {
        return buildStepFailure(step, resp, response, null);
    }

    private RuntimeException buildStepFailure(String step, Map<String, Object> resp, DahuaIssueCardResponse response, String fallback) {
        String code = String.valueOf(resp == null ? "" : resp.getOrDefault("code", ""));
        String err = String.valueOf(resp == null ? "" : resp.getOrDefault("errMsg", fallback == null ? "unknown error" : fallback));
        DahuaIssueStepResult r = new DahuaIssueStepResult();
        r.setStepName(step);
        r.setSuccess(false);
        r.setUpstreamCode(code);
        r.setUpstreamErrMsg(err);
        r.setMessage(fallback == null ? "上游接口失败" : fallback);
        r.setRawSnippet(String.valueOf(resp));
        response.getSteps().add(r);
        response.setFailStep(step);
        response.setSuccess(false);
        log.error("[dahua-issue][{}] fail code={} err={}", step, code, err);
        return new DahuaIssueException("步骤[" + step + "]失败: " + err + " (code=" + code + ")", response);
    }

    private void addSuccessStep(DahuaIssueCardResponse response, String step, Map<String, Object> resp, String msg) {
        DahuaIssueStepResult r = new DahuaIssueStepResult();
        r.setStepName(step);
        r.setSuccess(true);
        r.setUpstreamCode(String.valueOf(resp == null ? "" : resp.getOrDefault("code", "")));
        r.setUpstreamErrMsg(String.valueOf(resp == null ? "" : resp.getOrDefault("errMsg", "")));
        r.setMessage(msg);
        r.setRawSnippet(String.valueOf(resp));
        response.getSteps().add(r);
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private boolean isPersonSyncDelayError(Map<String, Object> resp) {
        String err = extractErrMsg(resp);
        return err.contains("未同步至人员管理")
                || err.contains("人员未同步")
                || err.contains("未同步至权限");
    }

    private String extractErrMsg(Map<String, Object> resp) {
        return String.valueOf(resp == null ? "" : resp.getOrDefault("errMsg", ""));
    }

    private boolean isCardAlreadyExistsError(Map<String, Object> resp) {
        String err = extractErrMsg(resp);
        return err.contains("卡片已经存在") || err.contains("卡片已存在");
    }

    /**
     * 大华常见：新增后已是激活态，再调 active 返回 status not support。
     */
    private boolean isCardActivationSkippableUpstreamError(Map<String, Object> resp) {
        String err = extractErrMsg(resp).toLowerCase(Locale.ROOT);
        if (err.isEmpty()) {
            return false;
        }
        if (err.contains("not support") && (err.contains("status") || err.contains("operation"))) {
            return true;
        }
        if (err.contains("already") && err.contains("activ")) {
            return true;
        }
        return err.contains("已激活") || err.contains("无需激活") || err.contains("重复激活");
    }
}
