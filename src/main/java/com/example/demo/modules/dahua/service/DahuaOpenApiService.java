package com.example.demo.modules.dahua.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class DahuaOpenApiService {
    private static final Logger log = LoggerFactory.getLogger(DahuaOpenApiService.class);
    private static final DateTimeFormatter DT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final DahuaAuthService authService;

    public DahuaOpenApiService(DahuaAuthService authService) {
        this.authService = authService;
    }

    public List<Map<String, Object>> fetchAllDepartments() {
        List<Map<String, Object>> all = new ArrayList<>();
        int pageNum = 1;
        int totalPage = 1;
        while (pageNum <= totalPage) {
            Map<String, Object> body = new HashMap<>();
            body.put("pageNum", pageNum);
            body.put("pageSize", 200);
            Map<String, Object> resp = post("/evo-apigw/evo-brm/1.2.0/department/page", body);
            Map<String, Object> data = asMap(resp.get("data"));
            totalPage = parseInt(data.get("totalPage"), totalPage);
            all.addAll(asListOfMap(data.get("pageData")));
            pageNum++;
        }
        return all;
    }

    public List<Map<String, Object>> fetchAllDoorGroups() {
        List<Map<String, Object>> all = new ArrayList<>();
        int pageNum = 1;
        int totalPage = 1;
        while (pageNum <= totalPage) {
            Map<String, Object> body = new HashMap<>();
            body.put("pageNum", pageNum);
            body.put("pageSize", 200);
            Map<String, Object> resp = post("/evo-apigw/evo-accesscontrol/1.0.0/card/accessControl/doorGroup/bycondition/combined", body);
            Map<String, Object> data = asMap(resp.get("data"));
            totalPage = parseInt(data.get("totalPage"), totalPage);
            all.addAll(asListOfMap(data.get("pageData")));
            pageNum++;
        }
        return all;
    }

    /** 门组列表（带 doorGroupDetail 通道明细，门组分配/种子用） */
    public List<Map<String, Object>> fetchDoorGroupsWithDetails() {
        List<Map<String, Object>> all = new ArrayList<>();
        int pageNum = 1;
        while (pageNum <= 50) {
            Map<String, Object> body = new HashMap<>();
            body.put("pageNum", pageNum);
            body.put("pageSize", 100);
            Map<String, Object> resp = postRaw("/evo-apigw/evo-accesscontrol/1.0.0/doorGroup/page", body);
            Map<String, Object> data = asMap(resp.get("data"));
            List<Map<String, Object>> pageData = asListOfMap(data.get("pageData"));
            all.addAll(pageData);
            if (pageData.size() < 100) break;
            pageNum++;
        }
        return all;
    }

    public Map<String, Object> addDoorGroup(Map<String, Object> body) {
        return postRaw("/evo-apigw/evo-accesscontrol/1.0.0/doorGroup/add", body);
    }

    public Map<String, Object> updateDoorGroup(Map<String, Object> body) {
        return postRaw("/evo-apigw/evo-accesscontrol/1.0.0/card/accessControl/doorGroup/update", body);
    }

    public Map<String, Object> deleteDoorGroups(List<Long> doorGroupIds) {
        Map<String, Object> body = new HashMap<>();
        body.put("doorGroupIds", doorGroupIds);
        return postRaw("/evo-apigw/evo-accesscontrol/1.0.0/doorGroup/delete", body);
    }

    /** 设备组织树（门组归属组织下拉用） */
    public Map<String, Object> fetchDeviceOrgTree() {
        return postRaw("/evo-apigw/evo-brm/1.2.1/tree/client/device-org", new HashMap<>());
    }

    /** 大华人员检索（按部门 / 关键字） */
    public Map<String, Object> selectPersons(Map<String, Object> body) {
        return postRaw("/evo-apigw/evo-accesscontrol/1.0.0/card/person/select/page", body);
    }

    /** 按人授权列表（带卡号、授权状态、人员状态、部门路径等完整字段） */
    public Map<String, Object> listPersonAuthoritiesPage(Map<String, Object> body) {
        return postRaw("/evo-apigw/evo-accesscontrol/1.0.0/card/accessControl/personAuthority/page", body);
    }

    /** 删除人员（软删，可在已删除人员中恢复）；deleteCardFlag=1 时连带删除卡片 */
    public Map<String, Object> deletePersons(Map<String, Object> body) {
        return postRaw("/evo-apigw/evo-brm/1.2.0/person/delete", body);
    }

    /** 人员分页（statusList=0 时取已删除人员） */
    public Map<String, Object> listPersonPage(Map<String, Object> body) {
        return postRaw("/evo-apigw/evo-brm/1.2.0/person/page", body);
    }

    public Map<String, Object> rollbackPersons(Map<String, Object> body) {
        return postRaw("/evo-apigw/evo-brm/1.2.0/person/recycle/rollback", body);
    }

    public Map<String, Object> purgePersons(Map<String, Object> body) {
        return rawExchange("/evo-apigw/evo-brm/1.2.0/person/recycle/delete", HttpMethod.DELETE, body);
    }

    /**
     * 修改单个通道信息（名称）。平台的专用接口，只需 channelName/channelCode/ownerCode，
     * 不需要像设备页那样整机回写；门禁通道与视频通道都实测可用。
     */
    public Map<String, Object> updateChannelInfo(Map<String, Object> body) {
        return rawExchange("/evo-apigw/evo-brm/1.2.1/device/channel", HttpMethod.PUT, body);
    }

    /** 某个人当前的门禁权限明细 */
    public Map<String, Object> fetchPersonAuthorities(String personCode) {
        Map<String, Object> body = new HashMap<>();
        body.put("personCode", personCode);
        return postRaw("/evo-apigw/evo-accesscontrol/1.0.0/card/accessControl/personAuthority/detail", body);
    }
    public List<Map<String, Object>> fetchAllDeviceChannels(Integer deviceCategory, Integer deviceType) {
        List<Map<String, Object>> all = new ArrayList<>();
        int pageNum = 1;
        int totalPage = 1;
        while (pageNum <= totalPage) {
            Map<String, Object> body = new HashMap<>();
            body.put("pageNum", pageNum);
            body.put("pageSize", 1000);
            body.put("sort", "channelSn");
            body.put("sortType", "ASC");
            if (deviceCategory != null) {
                body.put("deviceCategory", deviceCategory);
            }
            if (deviceType != null) {
                body.put("deviceType", deviceType);
            }
            body.put("includeSubOwnerCodeFlag", true);
            Map<String, Object> resp = post("/evo-apigw/evo-brm/1.2.0/device/channel/subsystem/page", body);
            Map<String, Object> data = asMap(resp.get("data"));
            totalPage = parseInt(data.get("totalPage"), totalPage);
            List<Map<String, Object>> pageData = asListOfMap(data.get("pageData"));
            all.addAll(pageData);
            if (pageData.isEmpty()) {
                break;
            }
            pageNum++;
        }
        return all;
    }

    /** 平台视频组织树（ICC 客户端实时预览左侧树的来源）：各组织节点及其通道 */
    public List<Map<String, Object>> fetchVideoOrgTree(String rootOrgCode) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("channelTypes", List.of(1, 2, 0));
        body.put("orgCode", rootOrgCode == null ? "" : rootOrgCode);
        body.put("displayType", 0);
        Map<String, Object> resp = postRaw("/evo-apigw/evo-brm/1.2.1/tree/client/device-org", body);
        if (!isSuccess(resp)) {
            return List.of();
        }
        return asListOfMap(asMap(resp.get("data")).get("organizations"));
    }

    /** 设备名称（如 `SY-NVR-07`）；取不到返回 null */
    public String fetchDeviceName(String deviceCode) {
        if (deviceCode == null || deviceCode.isBlank()) {
            return null;
        }
        Map<String, Object> resp = getRaw("/evo-apigw/evo-brm/1.2.1/device/" + deviceCode.trim());
        if (!isSuccess(resp)) {
            return null;
        }
        Object name = asMap(resp.get("data")).get("deviceName");
        return name == null ? null : String.valueOf(name);
    }

    public Long generatePersonId() {
        Map<String, Object> resp = get("/evo-apigw/evo-brm/1.0.0/person/generate-id");
        Map<String, Object> data = asMap(resp.get("data"));
        return parseLong(data.get("id"));
    }

    public Map<String, Object> addPerson(Map<String, Object> body) {
        return post("/evo-apigw/evo-brm/1.2.0/person/subsystem/add", body);
    }

    /** 局部更新人员：只提交需要改的字段，未提交的字段保持不变 */
    public Map<String, Object> updatePerson(Map<String, Object> body) {
        return exchange("/evo-apigw/evo-brm/1.2.0/person/subsystem/update", HttpMethod.PUT, body);
    }

    public Long generateCardId() {
        Map<String, Object> resp = get("/evo-apigw/evo-brm/1.0.0/card/generate-id");
        Map<String, Object> data = asMap(resp.get("data"));
        return parseLong(data.get("id"));
    }

    public Map<String, Object> addCard(Map<String, Object> body) {
        return post("/evo-apigw/evo-brm/1.0.0/card/add", body);
    }

    public Map<String, Object> updateCard(Map<String, Object> body) {
        return putRaw("/evo-apigw/evo-brm/1.0.0/card/update", body);
    }

    public Map<String, Object> batchAuthority(Map<String, Object> body) {
        return post("/evo-apigw/evo-accesscontrol/1.0.0/card/accessControl/personAuthority/batchAuthority", body);
    }

    /**
     * 写入大华 combined 刷卡记录查询的刷卡时间窗（与官方请求示例一致：仅 start/endSwingTime）。
     * 历史回溯分段上界常为次日 00:00:00，此处换算为上一自然日 23:59:59，避免漏掉段内最后一天。
     */
    public static void applySwingRecordTimeRange(Map<String, Object> query, LocalDateTime swingStart, LocalDateTime swingEnd) {
        if (query == null || swingStart == null || swingEnd == null) {
            return;
        }
        LocalDateTime endInclusive = toInclusiveSwingEndTime(swingStart, swingEnd);
        query.put("startSwingTime", formatDateTime(swingStart));
        query.put("endSwingTime", formatDateTime(endInclusive));
        query.remove("startCreateTime");
        query.remove("endCreateTime");
    }

    /**
     * 实时短窗轮询：在刷卡时间窗外再带入库时间（文档对 create 窗的说明主要面向实时分页防错位）。
     */
    public static void applySwingRecordTimeRangeForLivePoll(
            Map<String, Object> query, LocalDateTime swingStart, LocalDateTime swingEnd) {
        applySwingRecordTimeRange(query, swingStart, swingEnd);
        if (query == null || swingStart == null || swingEnd == null) {
            return;
        }
        LocalDateTime endInclusive = toInclusiveSwingEndTime(swingStart, swingEnd);
        query.put("startCreateTime", formatDateTime(swingStart.minusMinutes(30)));
        query.put("endCreateTime", formatDateTime(endInclusive));
    }

    /**
     * 分段结束为次日 0 点时，转为段内最后一天的 23:59:59（对齐文档单日示例 endSwingTime）。
     */
    public static LocalDateTime toInclusiveSwingEndTime(LocalDateTime swingStart, LocalDateTime swingEndBound) {
        if (swingEndBound == null) {
            return null;
        }
        if (swingStart == null || !swingEndBound.isAfter(swingStart)) {
            return swingEndBound.with(LocalTime.of(23, 59, 59));
        }
        boolean midnight =
                swingEndBound.getHour() == 0
                        && swingEndBound.getMinute() == 0
                        && swingEndBound.getSecond() == 0;
        if (midnight) {
            long daysBetween = ChronoUnit.DAYS.between(swingStart.toLocalDate(), swingEndBound.toLocalDate());
            if (daysBetween >= 1) {
                return swingEndBound.toLocalDate().minusDays(1).atTime(23, 59, 59);
            }
            return swingEndBound.toLocalDate().atTime(23, 59, 59);
        }
        return swingEndBound;
    }

    /**
     * 移除空字符串等无效可选筛选，避免大华侧按空值过滤导致 pageData 恒为空。
     */
    public static void sanitizeSwingRecordQuery(Map<String, Object> query) {
        if (query == null) {
            return;
        }
        removeIfBlank(query, "personName", "personCode", "cardNumber", "deptIds", "category");
        Object openType = query.get("openType");
        if (openType != null && String.valueOf(openType).isBlank()) {
            query.remove("openType");
        }
        Object enterOrExit = query.get("enterOrExit");
        if (enterOrExit != null && String.valueOf(enterOrExit).isBlank()) {
            query.remove("enterOrExit");
        }
        Object openResult = query.get("openResult");
        if (openResult != null && String.valueOf(openResult).isBlank()) {
            query.remove("openResult");
        }
        Object channelCodes = query.get("channelCodes");
        if (channelCodes instanceof List<?> list && list.isEmpty()) {
            query.remove("channelCodes");
        }
    }

    private static void removeIfBlank(Map<String, Object> query, String... keys) {
        for (String key : keys) {
            Object v = query.get(key);
            if (v == null) {
                continue;
            }
            if (String.valueOf(v).isBlank()) {
                query.remove(key);
            }
        }
    }

    /**
     * 大华门禁刷卡记录分页查询（接口不保证总页数/总行数可用，调用方需自行按 pageData 为空停止）。
     */
    public Map<String, Object> fetchSwingCardRecordByConditionCombined(Map<String, Object> body) {
        if (body == null) {
            body = new HashMap<>();
        }
        sanitizeSwingRecordQuery(body);
        Object pageNum = body.get("pageNum");
        Object pageSize = body.get("pageSize");
        if (parseInt(pageNum, 0) <= 0) {
            throw new IllegalArgumentException("pageNum 必须为正整数");
        }
        if (parseInt(pageSize, 0) <= 0) {
            throw new IllegalArgumentException("pageSize 必须为正整数");
        }
        Object startSwingTime = body.get("startSwingTime");
        Object endSwingTime = body.get("endSwingTime");
        if (startSwingTime == null || String.valueOf(startSwingTime).isBlank()) {
            throw new IllegalArgumentException("startSwingTime 不能为空");
        }
        if (endSwingTime == null || String.valueOf(endSwingTime).isBlank()) {
            throw new IllegalArgumentException("endSwingTime 不能为空");
        }
        Map<String, Object> resp = post(
                "/evo-apigw/evo-accesscontrol/1.0.0/card/accessControl/swingCardRecord/bycondition/combined",
                body
        );
        Map<String, Object> data = asMap(resp.get("data"));
        if (!data.containsKey("pageData")) {
            data.put("pageData", new ArrayList<>());
        }
        resp.put("data", data);
        return resp;
    }

    public Map<String, Object> deleteSinglePrivilege(Map<String, Object> body) {
        return post("/evo-apigw/evo-accesscontrol/1.0.0/card/accessControl/personAuthority/deleteSinglePrivilege", body);
    }

    /** 激活卡片；返回原始响应，由调用方判断（已激活时平台返回 28140006） */
    public Map<String, Object> activateCard(Map<String, Object> body) {
        return putRaw("/evo-apigw/evo-brm/1.0.0/card/active", body);
    }

    public Map<String, Object> controlDoor(String mode, List<String> channelCodeList) {
        if (channelCodeList == null || channelCodeList.isEmpty()) {
            throw new IllegalArgumentException("channelCodeList 不能为空");
        }
        String path = switch (String.valueOf(mode).toUpperCase()) {
            case "OPEN" -> "/evo-apigw/evo-accesscontrol/1.0.0/card/accessControl/channelControl/openDoor";
            case "CLOSE" -> "/evo-apigw/evo-accesscontrol/1.0.0/card/accessControl/channelControl/closeDoor";
            case "STAY_OPEN" -> "/evo-apigw/evo-accesscontrol/1.0.0/card/accessControl/channelControl/stayOpen";
            case "STAY_CLOSE" -> "/evo-apigw/evo-accesscontrol/1.0.0/card/accessControl/channelControl/stayClose";
            case "NORMAL" -> "/evo-apigw/evo-accesscontrol/1.0.0/card/accessControl/channelControl/normal";
            default -> throw new IllegalArgumentException("不支持的门禁控制模式: " + mode);
        };
        Map<String, Object> body = new HashMap<>();
        body.put("channelCodeList", channelCodeList);
        return postRaw(path, body);
    }

    public Map<String, Object> queryDoorStatus(String channelCode, List<String> channelCodes, Long doorGroupId) {
        Map<String, Object> body = new HashMap<>();
        if (channelCode != null && !channelCode.isBlank()) {
            body.put("channelCode", channelCode);
        } else if (channelCodes != null && !channelCodes.isEmpty()) {
            body.put("channelCodes", channelCodes);
        } else if (doorGroupId != null) {
            body.put("doorGroupId", doorGroupId);
        } else {
            throw new IllegalArgumentException("channelCode/channelCodes/doorGroupId 至少传一个");
        }
        body.put("allowSmartLock", false);
        return postRaw("/evo-apigw/evo-accesscontrol/1.0.0/card/accessControl/channelControl/channels", body);
    }

    public static String formatDateTime(LocalDateTime dateTime) {
        return dateTime.format(DT);
    }

    public static int parseInt(Object value, int defaultValue) {
        if (value == null) return defaultValue;
        if (value instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (Exception e) {
            return defaultValue;
        }
    }

    public static Long parseLong(Object value) {
        if (value == null) return null;
        if (value instanceof Number n) return n.longValue();
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (Exception e) {
            return null;
        }
    }

    public static Map<String, Object> asMap(Object value) {
        if (value instanceof Map<?, ?> m) {
            Map<String, Object> out = new HashMap<>();
            for (Map.Entry<?, ?> e : m.entrySet()) {
                out.put(String.valueOf(e.getKey()), e.getValue());
            }
            return out;
        }
        return new HashMap<>();
    }

    public static List<Map<String, Object>> asListOfMap(Object value) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (value instanceof List<?> list) {
            for (Object it : list) {
                out.add(asMap(it));
            }
        }
        return out;
    }

    private Map<String, Object> get(String path) {
        return exchange(path, HttpMethod.GET, null);
    }

    private Map<String, Object> post(String path, Map<String, Object> body) {
        return exchange(path, HttpMethod.POST, body);
    }

    public Map<String, Object> postRaw(String path, Map<String, Object> body) {
        return rawExchange(path, HttpMethod.POST, body);
    }

    public Map<String, Object> putRaw(String path, Map<String, Object> body) {
        return rawExchange(path, HttpMethod.PUT, body);
    }

    public Map<String, Object> getRaw(String path) {
        return rawExchange(path, HttpMethod.GET, null);
    }

    /**
     * 按人员编码查询大华人员信息，用于获取 departmentId 等字段。
     * 先尝试 person/page 分页接口，失败则尝试 GET /person/{personId}。
     */
    public Map<String, Object> queryPersonByCode(String personCode, Long personId) {
        // 策略A：POST /evo-apigw/evo-brm/1.2.0/person/page（按 code 过滤）
        Map<String, Object> body = new HashMap<>();
        body.put("pageNum", 1);
        body.put("pageSize", 1);
        body.put("code", personCode);
        Map<String, Object> resp = postRaw("/evo-apigw/evo-brm/1.2.0/person/page", body);
        if (isSuccess(resp)) {
            Map<String, Object> data = asMap(resp.get("data"));
            List<Map<String, Object>> pageData = asListOfMap(data.get("pageData"));
            if (!pageData.isEmpty()) {
                log.info("[dahua-openapi] person/page 找到人员 code={}", personCode);
                return pageData.get(0);
            }
        }
        log.warn("[dahua-openapi] person/page 未找到人员 code={} resp={}", personCode, resp);

        // 策略B：GET /evo-apigw/evo-brm/1.2.0/person/{personId}
        if (personId != null && personId > 0) {
            Map<String, Object> resp2 = getRaw("/evo-apigw/evo-brm/1.2.0/person/" + personId);
            if (isSuccess(resp2)) {
                Map<String, Object> data = asMap(resp2.get("data"));
                if (data != null && data.get("id") != null) {
                    log.info("[dahua-openapi] GET /person/{} 找到人员", personId);
                    return data;
                }
            }
            log.warn("[dahua-openapi] GET /person/{} 未找到人员 resp={}", personId, resp2);
        }

        return null;
    }

    /** 查询卡片获取 Dahua 内部 ID（用于后续删除等操作） */
    public Map<String, Object> queryCardByNumber(String cardNumber) {
        String path = "/evo-apigw/evo-brm/1.0.0/card/"
                + org.springframework.web.util.UriUtils.encodePathSegment(cardNumber.trim(), java.nio.charset.StandardCharsets.UTF_8);
        return getRaw(path);
    }

    /** 批量退卡（激活→空白），返回后可删除 */
    public Map<String, Object> returnCardById(Long cardId) {
        Map<String, Object> body = new HashMap<>();
        body.put("cardIds", java.util.List.of(cardId));
        return rawExchange("/evo-apigw/evo-brm/1.0.0/card/return", HttpMethod.PUT, body);
    }

    public Map<String, Object> deleteCardByNumber(String cardNumber) {
        // 先查卡片获取 ID
        Map<String, Object> cardResp = queryCardByNumber(cardNumber);
        Map<String, Object> body = new HashMap<>();
        if (isSuccess(cardResp)) {
            Map<String, Object> cardData = asMap(cardResp.get("data"));
            Object cardId = cardData != null ? cardData.get("id") : null;
            if (cardId != null) {
                body.put("cardIds", java.util.List.of(parseLong(cardId)));
            }
        }
        // 回退：用卡号删除
        if (!body.containsKey("cardIds")) {
            body.put("cardNumbers", java.util.List.of(cardNumber));
        }
        return rawExchange("/evo-apigw/evo-brm/1.0.0/card/delete", HttpMethod.DELETE, body);
    }

    public boolean isSuccess(Map<String, Object> resp) {
        if (resp == null) return false;
        Object success = resp.get("success");
        String code = String.valueOf(resp.getOrDefault("code", ""));
        return Boolean.TRUE.equals(success) || "0".equals(code);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> exchange(String path, HttpMethod method, Map<String, Object> body) {
        Map<String, Object> resp = rawExchange(path, method, body);
        assertSuccess(resp, path);
        return resp;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> rawExchange(String path, HttpMethod method, Map<String, Object> body) {
        boolean retried = false;
        while (true) {
            String url = authService.getBaseUrl() + path;
            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "bearer " + authService.getValidToken());
            headers.setContentType(MediaType.APPLICATION_JSON);
            try {
                Object payload = body == null ? null : body;
                Map<String, Object> resp = authService.getRestTemplate()
                        .exchange(url, method, new HttpEntity<>(payload, headers), Map.class)
                        .getBody();
                if (!retried && isTokenInvalidResp(resp)) {
                    retried = true;
                    authService.forceRefreshToken();
                    continue;
                }
                return resp;
            } catch (HttpStatusCodeException ex) {
                if (!retried && ex.getStatusCode().value() == 401) {
                    retried = true;
                    authService.forceRefreshToken();
                    continue;
                }
                String msg = "调用大华接口失败: " + path + ", " + ex.getMessage();
                log.error("[dahua-openapi] {}", msg);
                throw new RuntimeException(msg, ex);
            } catch (Exception ex) {
                String msg = "调用大华接口失败: " + path + ", " + ex.getMessage();
                log.error("[dahua-openapi] {}", msg);
                throw new RuntimeException(msg, ex);
            }
        }
    }

    private boolean isTokenInvalidResp(Map<String, Object> resp) {
        if (resp == null) {
            return false;
        }
        String code = String.valueOf(resp.getOrDefault("code", ""));
        String errMsg = String.valueOf(resp.getOrDefault("errMsg", ""));
        return "27001007".equals(code) || errMsg.toLowerCase().contains("invalid access_token");
    }

    private void assertSuccess(Map<String, Object> resp, String path) {
        if (resp == null) {
            throw new RuntimeException("大华接口返回为空: " + path);
        }
        Object success = resp.get("success");
        String code = String.valueOf(resp.getOrDefault("code", ""));
        if (Boolean.TRUE.equals(success) || "0".equals(code)) {
            return;
        }
        String errMsg = String.valueOf(resp.getOrDefault("errMsg", "unknown error"));
        throw new RuntimeException("大华接口失败(" + path + "), code=" + code + ", errMsg=" + errMsg);
    }
}
