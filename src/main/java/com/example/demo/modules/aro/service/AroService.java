package com.example.demo.modules.aro.service;

import com.alibaba.fastjson2.JSON;
import com.example.demo.common.event.CredentialsChangedEvent;
import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.dto.AroRecord;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.notification.service.NotificationSettingsService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.example.demo.modules.twin.common.support.TwinTimingDiagnostics;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;
import javax.annotation.PostConstruct;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class AroService {

    private static final Logger log = LoggerFactory.getLogger(AroService.class);

    @Autowired
    @Qualifier("aroRestTemplate")
    private RestTemplate restTemplate;

    private volatile String cachedToken = null;
    private volatile String lastAroErrorMessage = "";

    // @Value 仅作为默认值，运行时优先从系统设置（sys_system_config）读取
    @Value("${app.aro.account:}")
    private String defaultAccount;
    @Value("${app.aro.password:}")
    private String defaultPassword;

    private String account;
    private String password;

    @Autowired
    private AroPersonnelMapper aroPersonnelMapper;

    private final NotificationSettingsService settingsService;

    public AroService(NotificationSettingsService settingsService) {
        this.settingsService = settingsService;
    }

    @PostConstruct
    public void forceInitialLogin() {
        try {
            reloadCredentials();
            log.info("[系统点火] 正在优先抢占 ARO 官方全局 Token，阻塞其他无关任务...");
            boolean success = login();
            if (success) {
                log.info("[系统点火] ARO Token 抢占成功！主电源已合闸，放行后续自检与雷达订阅！");
            } else {
                log.error("[系统点火] ARO Token 获取失败，请检查账号密码或网络！");
            }
        } catch (Exception e) {
            // 数据库表尚未就绪（StartupRunner 建表晚于 @PostConstruct）
        }
    }

    /** 从 sys_system_config 加载凭证，DB 无值时回退到 @Value / 环境变量 */
    private void reloadCredentials() {
        this.account = settingsService.getEffectiveValue("credentials", "aro.account", defaultAccount);
        this.password = settingsService.getEffectiveValue("credentials", "aro.password", defaultPassword);
    }

    @EventListener
    public void onCredentialsChanged(CredentialsChangedEvent event) {
        if (event.isCredentials() && event.getConfigKey() != null && event.getConfigKey().startsWith("aro.")) {
            log.info("[ARO] 系统设置凭证变动，重载并清除旧 Token: {}", event.getConfigKey());
            reloadCredentials();
            this.cachedToken = null;
        }
    }

    /** 测试连接：尝试登录 ARO，成功返回 true，失败返回错误消息。 */
    public Map<String, Object> testConnection() {
        reloadCredentials();
        this.cachedToken = null;
        boolean ok = login();
        if (ok) {
            return Map.of("ok", true);
        }
        return Map.of("ok", false, "error", getLastAroErrorMessage());
    }

    /**
     * 1. 模拟蓝图的 FetchToken：去 ARO 拿 Token
     */
    public boolean login() {
        long t0 = System.currentTimeMillis();
        String url = "https://aro.shsmu.edu.cn/jtu/api/login";
        Map<String, String> body = new HashMap<>();
        body.put("account", account);
        body.put("password", password);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, String>> request = new HttpEntity<>(body, headers);

        try {
            log.info("[ARO] 正在请求登录获取 Token...");
            Map response = restTemplate.postForObject(url, request, Map.class);

            if (response != null && response.containsKey("data")) {
                Map data = (Map) response.get("data");
                if (data.containsKey("token")) {
                    this.cachedToken = (String) data.get("token");
                    this.lastAroErrorMessage = "";
                    log.info("[ARO] 登录成功！已获取最新 Token。");
                    TwinTimingDiagnostics.logAro("login", "-", System.currentTimeMillis() - t0, true, "token ok");
                    return true;
                }
            }
            this.lastAroErrorMessage = "ARO 登录失败: 返回体缺少 token";
        } catch (Exception e) {
            this.lastAroErrorMessage = "ARO 登录失败: " + e.getMessage();
            log.error("[ARO] 登录失败", e);
            TwinTimingDiagnostics.logAro("login", "-", System.currentTimeMillis() - t0, false, e.getMessage());
            return false;
        }
        TwinTimingDiagnostics.logAro("login", "-", System.currentTimeMillis() - t0, false, lastAroErrorMessage);
        return false;
    }

    public String getLastAroErrorMessage() {
        return (lastAroErrorMessage == null || lastAroErrorMessage.isBlank())
                ? "ARO 服务异常，请稍后重试"
                : lastAroErrorMessage;
    }

    public boolean isNoLeaveRoomError() {
        String msg = getLastAroErrorMessage();
        return msg.contains("无房间需要离开") || msg.contains("no room need leave");
    }

    /**
     * JTU 公开接口代理（如新闻）：确保已登录并返回 Token。
     */
    public String requireJtuApiToken() {
        if (cachedToken == null || cachedToken.isBlank()) {
            if (!login()) {
                throw new IllegalStateException(getLastAroErrorMessage());
            }
        }
        return cachedToken;
    }

    /** Token 失效（如 401）时清空，触发下次重新登录 */
    public void clearJtuCachedToken() {
        this.cachedToken = null;
    }

    /**
     * 2. 🚀 核心拉取引擎：绕过 Spring 自动编码，发送绝对真实的 URI！
     */
    public List<AroRecord> fetchRecordsByCondition(String rangeDate, Integer state, int pageNum, int pageSize) {
        if (this.cachedToken == null && !login()) {
            return new ArrayList<>();
        }

        // 1. 手动将空格严格替换为浏览器的 %20 标准
        String encodedRangeDate = "";
        if (rangeDate != null && !rangeDate.isEmpty()) {
            encodedRangeDate = rangeDate.replace(" ", "%20");
        }

        String stateStr = state != null ? String.valueOf(state) : "";

        // 2. 暴力拼接绝对忠诚的 URL 字符串
        String urlString = "https://aro.shsmu.edu.cn/jtu/api/access/record/list?" +
                "departmentId=&email=&mobilePhone=&name=&officePhone=&projectGroupId=&" +
                "rangeDate=" + encodedRangeDate + "&" +
                "state=" + stateStr + "&" +
                "userTypeId=&accessType=&floorId=&areaId=&" +
                "pageNum=" + pageNum + "&" +
                "pageSize=" + pageSize +
                "&_t=" + System.currentTimeMillis(); // 补上时间戳防缓存

        HttpHeaders headers = new HttpHeaders();
        headers.set("Token", this.cachedToken);
        HttpEntity<String> request = new HttpEntity<>(headers);

        try {
            // 🚨 终极外科手术：将 String 强制转换为 java.net.URI 对象！
            // 彻底阻止 RestTemplate 把我们拼好的 %20 二次编码成 %2520！
            java.net.URI uri = java.net.URI.create(urlString);

            // 这里传入的是 uri 对象，而不是 urlString！
            ResponseEntity<String> response = restTemplate.exchange(uri, HttpMethod.GET, request, String.class);
            String jsonBody = response.getBody();

            // 剥离外层，反序列化为实体类集合
            Map<String, Object> root = com.alibaba.fastjson2.JSON.parseObject(jsonBody, Map.class);
            if (root.containsKey("data")) {
                Map<String, Object> dataMap = (Map<String, Object>) root.get("data");
                if (dataMap.containsKey("list")) {
                    String listJson = com.alibaba.fastjson2.JSON.toJSONString(dataMap.get("list"));
                    return com.alibaba.fastjson2.JSON.parseArray(listJson, AroRecord.class);
                }
            }
            return new ArrayList<>();

        } catch (HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                log.info("[ARO] Token 已过期，正在重新登录...");
                this.cachedToken = null;
                if (login()) {
                    return fetchRecordsByCondition(rangeDate, state, pageNum, pageSize);
                }
            }
            log.error("[ARO] 拉取记录报错", e);
            return new ArrayList<>();
        } catch (Exception e) {
            log.error("[ARO] 网络异常", e);
            return new ArrayList<>();
        }
    }

    /**
     * 轻量实时穿甲弹：仅拉取最新 N 条，用于扫码/确认离开后的即时刷新。
     * 调用接口：
     * GET /jtu/api/access/record/list?pageNum=1&pageSize=100
     * （项目内通过 fetchRecordsByCondition(...) 统一拼装同一路径与参数）
     */
    public List<AroRecord> fetchLatestRecordsForRealtime(int limit) {
        int pageSize = Math.max(1, Math.min(limit, 100));
        String today = java.time.LocalDate.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd"));
        String rangeDate = today + " - " + today;
        return fetchRecordsByCondition(rangeDate, null, 1, pageSize);
    }

    /**
     * 3. 🚀 幽灵收割机：全量拉取人员花名册
     */
    public List<AroPersonnel> fetchAllPersonnel() {
        if (this.cachedToken == null && !login()) {
            return new ArrayList<>();
        }

        List<AroPersonnel> allPersonnel = new ArrayList<>();
        int pageNum = 1;
        int pageSize = 100; // 每次拉取 100 人
        boolean keepFetching = true;

        log.info("[人员资料收割机] 开始启动，准备从官方 ARO 扒取全量数据...");

        while (keepFetching) {
            String urlString = "https://aro.shsmu.edu.cn/jtu/api/admin/user/list?" +
                    "pageNum=" + pageNum + "&pageSize=" + pageSize +
                    "&_t=" + System.currentTimeMillis();

            HttpHeaders headers = new HttpHeaders();
            headers.set("Token", this.cachedToken);
            HttpEntity<String> request = new HttpEntity<>(headers);

            try {
                java.net.URI uri = java.net.URI.create(urlString);
                ResponseEntity<String> response = restTemplate.exchange(uri, HttpMethod.GET, request, String.class);

                // 解析 JSON
                Map<String, Object> root = com.alibaba.fastjson2.JSON.parseObject(response.getBody(), Map.class);
                if (root.containsKey("data")) {
                    Map<String, Object> dataMap = (Map<String, Object>) root.get("data");
                    if (dataMap.containsKey("list")) {
                        String listJson = com.alibaba.fastjson2.JSON.toJSONString(dataMap.get("list"));
                        List<AroPersonnel> pageList = com.alibaba.fastjson2.JSON.parseArray(listJson, AroPersonnel.class);

                        if (pageList == null || pageList.isEmpty()) {
                            keepFetching = false; // 没数据了，退出
                        } else {
                            allPersonnel.addAll(pageList);
                            log.info("已获取第 {} 页数据，当前累计人数: {}", pageNum, allPersonnel.size());
                            pageNum++;
                            Thread.sleep(800); // 战术停顿 0.8 秒，防封杀
                        }
                    } else {
                        keepFetching = false;
                    }
                }
            } catch (Exception e) {
                log.error("[人员资料拉取失败] 第 {} 页异常", pageNum, e);
                keepFetching = false;
            }
        }

        log.info("[人员资料收割机] 任务完成！共计获取: {} 人！", allPersonnel.size());
        return allPersonnel;
    }

    /**
     * 轻量人员检索：用于前端预检下拉兜底（本地人员库为空时回源 ARO 官方）。
     */
    public List<Map<String, Object>> searchPersonnelLite(String keyword, int limit) {
        String kw = keyword == null ? "" : keyword.trim();
        if (kw.isEmpty()) return new ArrayList<>();
        int pageSize = Math.max(1, Math.min(limit, 50));
        if (this.cachedToken == null && !login()) {
            return new ArrayList<>();
        }
        try {
            String encodedName = java.net.URLEncoder.encode(kw, java.nio.charset.StandardCharsets.UTF_8);
            String urlString = "https://aro.shsmu.edu.cn/jtu/api/admin/user/list?"
                    + "pageNum=1&pageSize=" + pageSize
                    + "&name=" + encodedName
                    + "&_t=" + System.currentTimeMillis();
            HttpHeaders headers = new HttpHeaders();
            headers.set("Token", this.cachedToken);
            HttpEntity<String> request = new HttpEntity<>(headers);
            ResponseEntity<String> response = restTemplate.exchange(java.net.URI.create(urlString), HttpMethod.GET, request, String.class);
            Map<String, Object> root = JSON.parseObject(response.getBody(), Map.class);
            Object dataObj = root != null ? root.get("data") : null;
            if (!(dataObj instanceof Map<?, ?> dataMap)) return new ArrayList<>();
            Object listObj = dataMap.get("list");
            if (listObj instanceof List<?> list) {
                List<Map<String, Object>> out = new ArrayList<>();
                for (Object row : list) {
                    if (row instanceof Map<?, ?> m) {
                        Map<String, Object> one = new LinkedHashMap<>();
                        m.forEach((k, v) -> one.put(String.valueOf(k), v));
                        out.add(one);
                    }
                }
                return out;
            }
            return new ArrayList<>();
        } catch (Exception e) {
            log.error("[ARO] 人员检索回源失败", e);
            return new ArrayList<>();
        }
    }

    // ==========================================
    // 💥 孪生大屏打卡专属 API 组 (融合 Token 重连与穿甲弹 URL)
    // ==========================================

    /**
     * 🛠️ 内部小工具：统一提取装配 Token 的逻辑
     */
    private HttpHeaders getAuthHeaders() {
        HttpHeaders headers = new HttpHeaders();
        // 💥 完美复用你缓存的官方 Token！
        headers.set("Token", this.cachedToken);
        headers.setContentType(MediaType.APPLICATION_JSON);
        return headers;
    }

    // ==============================================================================
    // 💥 1. 获取允许进入的房间 (完美适配官方 GET 接口 + 修正真实 URL)
    // ==============================================================================
    public List<Map<String, Object>> getExamOfflineRoom(String userId) {
        long t0 = System.currentTimeMillis();
        if (this.cachedToken == null && !login()) {
            TwinTimingDiagnostics.logAro("examOfflineRoom", userId, System.currentTimeMillis() - t0, false, "login failed");
            return new ArrayList<>();
        }

        // 💥 修正点 1：URL 严格对齐官方最新路径，并将 userId 作为 Query 参数拼接
        String urlString = "https://aro.shsmu.edu.cn/jtu/api/admin/user/examOfflineRoom?userId=" + userId;

        try {
            java.net.URI uri = java.net.URI.create(urlString);

            // 💥 修正点 2：GET 请求没有 Body，传入 null 即可
            HttpEntity<String> entity = new HttpEntity<>(null, getAuthHeaders());

            // 💥 修正点 3：强制使用 HttpMethod.GET
            ResponseEntity<Map> response = restTemplate.exchange(uri, HttpMethod.GET, entity, Map.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                Object data = response.getBody().get("data");
                List<Map<String, Object>> parsed = tryParseRoomList(data);
                if (parsed != null) {
                    TwinTimingDiagnostics.logAro("examOfflineRoom", userId, System.currentTimeMillis() - t0, true,
                            "rooms=" + parsed.size());
                    return parsed;
                }
                log.warn("[ARO-探测] 可进入房间返回格式异常 | userId={}", userId);
            }
        } catch (org.springframework.web.client.HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                this.cachedToken = null;
                if (login()) return getExamOfflineRoom(userId);
            }
            log.error("[ARO-探测] 可进入房间查询失败 | userId={}", userId, e);
            TwinTimingDiagnostics.logAro("examOfflineRoom", userId, System.currentTimeMillis() - t0, false, e.getMessage());
        } catch (Exception e) {
            log.error("[ARO-探测] 可进入房间查询异常 | userId={}", userId, e);
            TwinTimingDiagnostics.logAro("examOfflineRoom", userId, System.currentTimeMillis() - t0, false, e.getMessage());
        }
        TwinTimingDiagnostics.logAro("examOfflineRoom", userId, System.currentTimeMillis() - t0, true, "empty");
        return new ArrayList<>();
    }

    // ==============================================================================
    // 💥 2. 获取滞留未离开的房间 (完美适配官方 GET 接口 + Query 传参)
    // ==============================================================================
    /**
     * 查询官方滞留房间。自动签退依赖此接口；网络读超时时由联动定时器保留状态并重试。
     * 对 {@link ResourceAccessException}（含 read timeout）最多重试 1 次。
     */
    public List<Map<String, Object>> getNoLeaveRoom(String userId) {
        long t0 = System.currentTimeMillis();
        if (this.cachedToken == null && !login()) {
            if (this.lastAroErrorMessage == null || this.lastAroErrorMessage.isBlank()) {
                this.lastAroErrorMessage = "探测滞留空间失败: 登录 ARO 失败";
            }
            TwinTimingDiagnostics.logAro("noLeaveRoom", userId, System.currentTimeMillis() - t0, false, lastAroErrorMessage);
            return null;
        }
        for (int attempt = 1; attempt <= 2; attempt++) {
            try {
                List<Map<String, Object>> result = getNoLeaveRoomOnce(userId);
                TwinTimingDiagnostics.logAro("noLeaveRoom", userId, System.currentTimeMillis() - t0,
                        result != null, result != null ? "rooms=" + result.size() : lastAroErrorMessage);
                return result;
            } catch (HttpClientErrorException e) {
                if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                    this.cachedToken = null;
                    if (login()) {
                        continue;
                    }
                }
                this.lastAroErrorMessage = "探测滞留空间失败: " + e.getStatusCode().value() + " " + e.getStatusText();
                log.warn("[aro] noLeaveRoom http error userId={} status={} msg={}",
                        userId, e.getStatusCode().value(), e.getMessage());
                TwinTimingDiagnostics.logAro("noLeaveRoom", userId, System.currentTimeMillis() - t0, false, e.getMessage());
                return null;
            } catch (ResourceAccessException e) {
                this.lastAroErrorMessage = "探测滞留空间失败: " + e.getMessage();
                if (attempt < 2) {
                    log.warn("[aro] noLeaveRoom timeout/retry userId={} attempt={} msg={}",
                            userId, attempt, e.getMessage());
                    continue;
                }
                log.warn("[aro] noLeaveRoom timeout userId={} afterRetries=2 msg={}", userId, e.getMessage());
                TwinTimingDiagnostics.logAro("noLeaveRoom", userId, System.currentTimeMillis() - t0, false, e.getMessage());
                return null;
            } catch (Exception e) {
                this.lastAroErrorMessage = "探测滞留空间失败: " + e.getMessage();
                log.warn("[aro] noLeaveRoom error userId={} msg={}", userId, e.getMessage());
                TwinTimingDiagnostics.logAro("noLeaveRoom", userId, System.currentTimeMillis() - t0, false, e.getMessage());
                return null;
            }
        }
        return null;
    }

    private List<Map<String, Object>> getNoLeaveRoomOnce(String userId) {
        String urlString = "https://aro.shsmu.edu.cn/jtu/api/admin/user/noLeaveRoom?userId=" + userId;
        java.net.URI uri = java.net.URI.create(urlString);
        HttpEntity<String> entity = new HttpEntity<>(null, getAuthHeaders());
        ResponseEntity<Map> response = restTemplate.exchange(uri, HttpMethod.GET, entity, Map.class);

        if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
            Object data = response.getBody().get("data");
            List<Map<String, Object>> parsed = tryParseRoomList(data);
            if (parsed != null) {
                this.lastAroErrorMessage = "";
                return parsed;
            }
            Object msg = response.getBody().get("message");
            this.lastAroErrorMessage = "探测滞留空间失败: 返回数据格式异常"
                    + (msg != null ? ("，message=" + msg) : "");
            log.warn("[aro] noLeaveRoom 数据格式异常 userId={} message={}", userId, msg);
            return null;
        }
        this.lastAroErrorMessage = "探测滞留空间失败: HTTP " + response.getStatusCodeValue();
        return null;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> tryParseRoomList(Object data) {
        if (data instanceof List) {
            return (List<Map<String, Object>>) data;
        }
        if (data == null) {
            return new ArrayList<>();
        }
        if (data instanceof String && ((String) data).trim().isEmpty()) {
            return new ArrayList<>();
        }
        if (data instanceof Map<?, ?> mapData) {
            // ARO 兼容: {"data":{}} 语义等同无数据
            if (mapData.isEmpty()) {
                return new ArrayList<>();
            }
            Object nestedData = mapData.get("data");
            if (nestedData != null && nestedData != data) {
                List<Map<String, Object>> nestedParsed = tryParseRoomList(nestedData);
                if (nestedParsed != null) {
                    return nestedParsed;
                }
            }
            Object list = mapData.get("list");
            if (list instanceof List) {
                return (List<Map<String, Object>>) list;
            }
            Object rows = mapData.get("rows");
            if (rows instanceof List) {
                return (List<Map<String, Object>>) rows;
            }
            Object records = mapData.get("records");
            if (records instanceof List) {
                return (List<Map<String, Object>>) records;
            }
            Object items = mapData.get("items");
            if (items instanceof List) {
                return (List<Map<String, Object>>) items;
            }
            // 兼容 ARO 返回单条对象（非数组）：{id: "...", name: "...", ...}
            if (mapData.containsKey("id") || mapData.containsKey("roomId")) {
                List<Map<String, Object>> one = new ArrayList<>();
                one.add((Map<String, Object>) mapData);
                return one;
            }
        }
        return null;
    }

    // ==============================================================================
    // 💥 3. 执行打卡动作 (完美适配官方 POST 接口 + 修正真实 URL)
    // ==============================================================================
    public boolean submitAccessRecord(String userId, String roomId, Integer accessType) {
        if (this.cachedToken == null && !login()) return false;

        // 💥 修正点：URL 严格对齐官方文档的 /access/record/save
        String url = "https://aro.shsmu.edu.cn/jtu/api/access/record/save";

        Map<String, Object> body = new HashMap<>();
        body.put("userId", userId);
        body.put("roomId", roomId);
        body.put("accessType", accessType); // 1:进入 2:离开 3:离开未还卡
        body.put("department", 1);          // 官方文档要求：暂时设置1位动科部

        try {
            java.net.URI uri = java.net.URI.create(url);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, getAuthHeaders());
            ResponseEntity<Map> response = restTemplate.exchange(uri, HttpMethod.POST, entity, Map.class);

            if (!response.getStatusCode().is2xxSuccessful()) {
                this.lastAroErrorMessage = "ARO HTTP 错误: " + response.getStatusCodeValue();
                log.warn("[ARO 响应] HTTP 非成功状态: {}", response.getStatusCodeValue());
                return false;
            }
            Map respBody = response.getBody();
            if (!isAroBusinessSuccess(respBody)) {
                String msg = respBody != null && respBody.get("message") != null
                        ? String.valueOf(respBody.get("message"))
                        : "业务状态非成功";
                this.lastAroErrorMessage = msg;
                log.warn("[aro] 打卡被拒 userId={} msg={}", userId, msg);
                return false;
            }
            this.lastAroErrorMessage = "";
            return true;
        } catch (org.springframework.web.client.HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                this.cachedToken = null;
                login();
                this.lastAroErrorMessage = "ARO 认证过期，已刷新令牌（不自动重试提交，由上游定时任务下一节拍重试）";
                log.warn("[ARO 响应] 401 未授权，已刷新令牌但不重试本次提交 userId={}", userId);
                return false;
            }
            this.lastAroErrorMessage = "ARO 请求失败: " + e.getStatusCode().value() + " " + e.getStatusText();
            log.error("[ARO 响应] 官方系统拒绝", e);
        } catch (Exception e) {
            this.lastAroErrorMessage = "ARO 请求异常: " + e.getMessage();
            log.error("[ARO 崩溃] 提交门禁记录断网或超时", e);
        }
        return false;
    }

    /**
     * 仅当官方返回体明确表示成功时才算成功，避免“请求发出即算成功”。
     */
    private boolean isAroBusinessSuccess(Map respBody) {
        if (respBody == null) {
            return false;
        }
        Object successObj = respBody.get("success");
        if (successObj != null) {
            if (successObj instanceof Boolean) {
                return (Boolean) successObj;
            }
            String s = String.valueOf(successObj).trim();
            if ("true".equalsIgnoreCase(s)) {
                return true;
            }
            if ("false".equalsIgnoreCase(s)) {
                return false;
            }
        }
        Integer status = parseIntLike(respBody.get("status"));
        if (status != null) {
            return status == 0;
        }
        Integer code = parseIntLike(respBody.get("code"));
        if (code != null) {
            return code == 0 || code == 200;
        }
        // 未识别到任何业务状态字段时，保守判失败
        return false;
    }

    private Integer parseIntLike(Object val) {
        if (val == null) return null;
        if (val instanceof Number) {
            return ((Number) val).intValue();
        }
        String s = String.valueOf(val).trim();
        if (s.isEmpty()) return null;
        try {
            if (s.contains(".")) {
                return (int) Double.parseDouble(s);
            }
            return Integer.parseInt(s);
        } catch (Exception ignored) {
            return null;
        }
    }

    // ==============================================================================
    // 💥 4. 获取实验动物订单 (完美照抄官方 GET 接口 + 自动 Token 管理与防过期机制)
    // ==============================================================================
    public Map<String, Object> fetchAnimalOrderPage(int pageNum, int pageSize) {
        // 如果没有 Token，自动触发登录
        if (this.cachedToken == null && !login()) return null;

        String urlString = "https://aro.shsmu.edu.cn/jtu/api/admin/order/list?pageNum=" + pageNum + "&pageSize=" + pageSize;
        log.info("[ARO 请求] 拉取动物订单 page={}, size={}", pageNum, pageSize);

        try {
            // 完美照抄你们的 uri 穿甲弹防转义设计
            java.net.URI uri = java.net.URI.create(urlString);

            // 完美照抄你们的 Token 组装器
            HttpEntity<String> entity = new HttpEntity<>(null, getAuthHeaders());

            ResponseEntity<Map> response = restTemplate.exchange(uri, HttpMethod.GET, entity, Map.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                String statusStr = String.valueOf(response.getBody().get("status"));
                if ("0".equals(statusStr) || "0.0".equals(statusStr)) {
                    // 只把最核心的 data 层剥离出去返回
                    return (Map<String, Object>) response.getBody().get("data");
                } else {
                    log.warn("[ARO 响应] 接口拒绝: {}", response.getBody().get("message"));
                }
            }
        } catch (org.springframework.web.client.HttpClientErrorException e) {
            // 完美照抄你们的 401 自动重登录机制！
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                log.info("[ARO] Token 已过期，正在重新登录并无缝重试...");
                this.cachedToken = null;
                if (login()) return fetchAnimalOrderPage(pageNum, pageSize);
            }
            log.error("[ARO 响应] 拉取订单失败", e);
        } catch (Exception e) {
            log.error("[ARO 崩溃] 拉取订单异常", e);
        }
        return null;
    }

    // ==============================================================================
    // 💥 5. 获取人员详情状态与惩戒记录 (完美解析 State)
    // ==============================================================================
    public Map<String, Object> getUserDetailAndDisciplinary(String userId) {
        long t0 = System.currentTimeMillis();
        if (this.cachedToken == null && !login()) {
            TwinTimingDiagnostics.logAro("userDetail", userId, System.currentTimeMillis() - t0, false, "login failed");
            return null;
        }

        String urlString = "https://aro.shsmu.edu.cn/jtu/api/admin/user/detail?id=" + userId;

        try {
            java.net.URI uri = java.net.URI.create(urlString);
            HttpEntity<String> entity = new HttpEntity<>(null, getAuthHeaders());
            ResponseEntity<Map> response = restTemplate.exchange(uri, HttpMethod.GET, entity, Map.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                TwinTimingDiagnostics.logAro("userDetail", userId, System.currentTimeMillis() - t0, true, "ok");
                return (Map<String, Object>) response.getBody().get("data");
            }
        } catch (org.springframework.web.client.HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                this.cachedToken = null;
                if (login()) return getUserDetailAndDisciplinary(userId);
            }
            log.warn("[aro] 人员详情查询失败 userId={} err={}", userId, e.getMessage());
            TwinTimingDiagnostics.logAro("userDetail", userId, System.currentTimeMillis() - t0, false, e.getMessage());
        } catch (Exception e) {
            log.warn("[aro] 人员详情网络异常 userId={} err={}", userId, e.getMessage());
            TwinTimingDiagnostics.logAro("userDetail", userId, System.currentTimeMillis() - t0, false, e.getMessage());
        }
        TwinTimingDiagnostics.logAro("userDetail", userId, System.currentTimeMillis() - t0, false, "empty body");
        return null;
    }

    // ==============================================================================
    // 💥 6. 强行修改人员状态 (解封 / 封禁)
    // ==============================================================================
    public boolean updateUserState(String userId, boolean valid) {
        if (this.cachedToken == null && !login()) return false;

        String urlString = "https://aro.shsmu.edu.cn/jtu/api/admin/user/updateState";
        log.info("[风控执行] 正在{}人员: {}", (valid ? "解封" : "封禁"), userId);

        Map<String, Object> body = new HashMap<>();
        body.put("userId", userId);
        body.put("valid", valid);
        body.put("invalidReason", null);

        try {
            java.net.URI uri = java.net.URI.create(urlString);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, getAuthHeaders());
            ResponseEntity<Map> response = restTemplate.exchange(uri, HttpMethod.POST, entity, Map.class);

            if (response.getStatusCode().is2xxSuccessful()) {
                log.info("[风控执行] 状态修改成功！");
                return true;
            }
        } catch (org.springframework.web.client.HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                this.cachedToken = null;
                if (login()) return updateUserState(userId, valid);
            }
            log.error("[风控执行] 修改失败", e);
        } catch (Exception e) {
            log.error("[风控执行] 网络异常", e);
        }
        return false;
    }

    /**
     * 笼位列表：按房间 + 架子查询（与「仅 shelveId」的旧接口不同，需同时传 roomId）。
     * GET /jtu/api/admin/cageBox/{roomId}/{shelveId}/animalCages/back
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> fetchAnimalCagesByRoomAndShelve(Long roomId, Long shelveId) {
        if (roomId == null || shelveId == null) {
            return Map.of();
        }
        if (this.cachedToken == null && !login()) {
            return Map.of();
        }
        String urlString = "https://aro.shsmu.edu.cn/jtu/api/admin/cageBox/"
                + roomId + "/" + shelveId + "/animalCages/back";
        try {
            java.net.URI uri = java.net.URI.create(urlString);
            HttpEntity<String> entity = new HttpEntity<>(null, getAuthHeaders());
            ResponseEntity<Map> response = restTemplate.exchange(uri, HttpMethod.GET, entity, Map.class);
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return (Map<String, Object>) response.getBody();
            }
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                this.cachedToken = null;
                if (login()) {
                    return fetchAnimalCagesByRoomAndShelve(roomId, shelveId);
                }
            }
            log.warn("[aro] 笼位列表请求失败 roomId={} shelveId={} err={}", roomId, shelveId, e.getMessage());
        } catch (Exception e) {
            log.warn("[aro] 笼位列表网络异常 roomId={} shelveId={} err={}", roomId, shelveId, e.getMessage());
        }
        return Map.of();
    }

    /**
     * 兼容状态回填：老接口通常包含更完整的状态字段（animalCageType/state/stateName）。
     * GET /jtu/api/admin/book/{roomId}/{shelveId}/animalCages
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> fetchAnimalCagesStatusByBook(Long roomId, Long shelveId) {
        if (roomId == null || shelveId == null) {
            return Map.of();
        }
        if (this.cachedToken == null && !login()) {
            return Map.of();
        }
        String urlString = "https://aro.shsmu.edu.cn/jtu/api/admin/book/"
                + roomId + "/" + shelveId + "/animalCages";
        try {
            java.net.URI uri = java.net.URI.create(urlString);
            HttpEntity<String> entity = new HttpEntity<>(null, getAuthHeaders());
            ResponseEntity<Map> response = restTemplate.exchange(uri, HttpMethod.GET, entity, Map.class);
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return (Map<String, Object>) response.getBody();
            }
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                this.cachedToken = null;
                if (login()) {
                    return fetchAnimalCagesStatusByBook(roomId, shelveId);
                }
            }
            log.warn("[aro] 笼位状态回填请求失败 roomId={} shelveId={} err={}", roomId, shelveId, e.getMessage());
        } catch (Exception e) {
            log.warn("[aro] 笼位状态回填网络异常 roomId={} shelveId={} err={}", roomId, shelveId, e.getMessage());
        }
        return Map.of();
    }

    /**
     * 按课题组名称模糊匹配 aro_personnel 表，返回该组成员 userId 列表。
     * 用于笼架违规判定引擎展开课题组成员。
     */
    public List<String> findUserIdsByProjectGroup(String projectGroupName) {
        if (projectGroupName == null || projectGroupName.isBlank()) {
            return Collections.emptyList();
        }
        try {
            return aroPersonnelMapper.selectUserIdsByProjectGroup(projectGroupName.trim());
        } catch (Exception e) {
            log.warn("[aro] 查询课题组成员失败 group={} err={}", projectGroupName, e.getMessage());
            return Collections.emptyList();
        }
    }

    // ==========================================================================
    // 🔧 笼位分配（2026-07-27 新增）
    // ==========================================================================

    /**
     * 获取分配用的 AUP 列表。
     * GET /jtu/api/admin/cageBox/aups
     *
     * @return [{ id, projectPiName, registerNumber, projectName }]
     */
    /**
     * 获取已批准的 AUP 列表（扁平，含完整名称/编号/课题组长）。
     * GET /jtu/api/admin/aup/audited — 返回 [{id, projectName, projectPiId, projectPiName, registerNumber, title}]
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> fetchAuditedAups(String token) {
        if (token == null || token.isBlank()) return Collections.emptyList();
        return fetchAuditedAupsInternal(token);
    }

    /**
     * 使用全局 Token 拉取已批准 AUP（降级方案）。
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> fetchAuditedAupsGlobal() {
        if (this.cachedToken == null && !login()) return Collections.emptyList();
        return fetchAuditedAupsInternal(this.cachedToken);
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> fetchAuditedAupsInternal(String token) {
        String urlString = "https://aro.shsmu.edu.cn/jtu/api/admin/aup/audited";
        try {
            java.net.URI uri = java.net.URI.create(urlString);
            HttpHeaders headers = new HttpHeaders();
            headers.set("Token", token);
            HttpEntity<String> entity = new HttpEntity<>(headers);
            ResponseEntity<Map> response = restTemplate.exchange(uri, HttpMethod.GET, entity, Map.class);
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                Object data = response.getBody().get("data");
                if (data instanceof List) return (List<Map<String, Object>>) data;
            }
        } catch (Exception e) {
            log.warn("[aro] 已批准AUP列表拉取失败 err={}", e.getMessage());
        }
        return Collections.emptyList();
    }

    /**
     * 使用全局 Token 拉取房间预约列表（降级方案）。
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> fetchRoomRentListGlobal(int pageNum, int pageSize) {
        if (this.cachedToken == null && !login()) return Map.of();
        return fetchRoomRentList(pageNum, pageSize, this.cachedToken);
    }

    /**
     * 使用全局 Token 拉取房间 AUP 明细（降级方案）。
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> fetchRoomRentAupsGlobal(String roomId, int pageNum, int pageSize) {
        if (this.cachedToken == null && !login()) return Map.of();
        return fetchRoomRentAups(roomId, pageNum, pageSize, this.cachedToken);
    }

    /**
     * 使用全局 Token 跨房间搜索 AUP（降级方案）。
     */
    public List<Map<String, Object>> searchAupsAcrossRoomsGlobal(String keyword) {
        if (this.cachedToken == null && !login()) return Collections.emptyList();
        return searchAupsAcrossRooms(keyword, this.cachedToken);
    }

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> fetchAupListForAllocation() {
        if (this.cachedToken == null && !login()) return Collections.emptyList();
        String urlString = "https://aro.shsmu.edu.cn/jtu/api/admin/cageBox/aups";
        try {
            java.net.URI uri = java.net.URI.create(urlString);
            HttpEntity<String> entity = new HttpEntity<>(null, getAuthHeaders());
            ResponseEntity<Map> response = restTemplate.exchange(uri, HttpMethod.GET, entity, Map.class);
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                Object data = response.getBody().get("data");
                if (data instanceof List) return (List<Map<String, Object>>) data;
            }
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                this.cachedToken = null;
                if (login()) return fetchAupListForAllocation();
            }
            log.warn("[aro] AUP 列表请求失败 err={}", e.getMessage());
        } catch (Exception e) {
            log.warn("[aro] AUP 列表网络异常 err={}", e.getMessage());
        }
        return Collections.emptyList();
    }

    /**
     * 执行笼位分配（租用）。
     * POST /jtu/api/admin/book
     */
    public boolean bookCages(Long roomId, Long shelveId, List<Long> cageIds, Long aupId) {
        if (this.cachedToken == null && !login()) return false;
        String urlString = "https://aro.shsmu.edu.cn/jtu/api/admin/book";
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("roomId", roomId);
        body.put("shelveId", shelveId);
        body.put("animalCageIds", cageIds);
        body.put("aupId", aupId);
        try {
            java.net.URI uri = java.net.URI.create(urlString);
            HttpHeaders headers = getAuthHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
            ResponseEntity<Map> response = restTemplate.exchange(uri, HttpMethod.POST, entity, Map.class);
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                Object status = response.getBody().get("status");
                if (Integer.valueOf(0).equals(status)) {
                    log.info("[aro] 笼位分配成功 roomId={} shelveId={} count={}", roomId, shelveId, cageIds.size());
                    return true;
                }
                Object msg = response.getBody().get("message");
                this.lastAroErrorMessage = msg != null ? String.valueOf(msg) : "笼位分配被拒";
                log.warn("[aro] 笼位分配被拒绝: {}", this.lastAroErrorMessage);
            }
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                this.cachedToken = null;
                if (login()) return bookCages(roomId, shelveId, cageIds, aupId);
            }
            this.lastAroErrorMessage = "笼位分配 HTTP " + e.getStatusCode().value();
            log.warn("[aro] 笼位分配请求失败 err={}", e.getMessage());
        } catch (Exception e) {
            this.lastAroErrorMessage = "笼位分配网络异常: " + e.getMessage();
            log.warn("[aro] 笼位分配网络异常 err={}", e.getMessage());
        }
        return false;
    }

    /**
     * 取消笼位预约。
     * POST /jtu/api/admin/book/cancel
     */
    public boolean cancelBookCages(List<Long> cageIds) {
        if (this.cachedToken == null && !login()) return false;
        String urlString = "https://aro.shsmu.edu.cn/jtu/api/admin/book/cancel";
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("animalCageIdList", cageIds);
        try {
            java.net.URI uri = java.net.URI.create(urlString);
            HttpHeaders headers = getAuthHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
            ResponseEntity<Map> response = restTemplate.exchange(uri, HttpMethod.POST, entity, Map.class);
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                Object status = response.getBody().get("status");
                if (Integer.valueOf(0).equals(status)) {
                    log.info("[aro] 取消笼位分配成功 count={}", cageIds.size());
                    return true;
                }
                Object msg = response.getBody().get("message");
                this.lastAroErrorMessage = msg != null ? String.valueOf(msg) : "取消分配被拒";
                log.warn("[aro] 取消分配被拒绝: {}", this.lastAroErrorMessage);
            }
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                this.cachedToken = null;
                if (login()) return cancelBookCages(cageIds);
            }
            this.lastAroErrorMessage = "取消分配 HTTP " + e.getStatusCode().value();
            log.warn("[aro] 取消分配请求失败 err={}", e.getMessage());
        } catch (Exception e) {
            this.lastAroErrorMessage = "取消分配网络异常: " + e.getMessage();
            log.warn("[aro] 取消分配网络异常 err={}", e.getMessage());
        }
        return false;
    }

    /**
     * 使用个人 Token 执行笼位分配（租用）。
     * 与 {@link #bookCages} 相同逻辑，但使用调用者传入的个人 Token 而非全局缓存 Token。
     * 401 时抛出 AroTokenRequiredException 由上层处理，不尝试用全局账号重新登录。
     */
    public boolean bookCagesWithToken(Long roomId, Long shelveId, List<Long> cageIds, Long aupId, String token) {
        if (token == null || token.isBlank()) return false;
        String urlString = "https://aro.shsmu.edu.cn/jtu/api/admin/book";
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("roomId", roomId);
        body.put("shelveId", shelveId);
        body.put("animalCageIds", cageIds);
        body.put("aupId", aupId);
        try {
            java.net.URI uri = java.net.URI.create(urlString);
            HttpHeaders headers = new HttpHeaders();
            headers.set("Token", token);
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
            ResponseEntity<Map> response = restTemplate.exchange(uri, HttpMethod.POST, entity, Map.class);
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                Object status = response.getBody().get("status");
                if (Integer.valueOf(0).equals(status)) {
                    log.info("[aro] 笼位分配成功(个人Token) roomId={} shelveId={} count={}", roomId, shelveId, cageIds.size());
                    return true;
                }
                log.warn("[aro] 笼位分配被拒绝(个人Token): {}", response.getBody().get("message"));
            }
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                throw new com.example.demo.modules.aro.exception.AroTokenRequiredException("ARO Token失效，请重新CAS登录");
            }
            log.warn("[aro] 笼位分配请求失败(个人Token) err={}", e.getMessage());
        } catch (Exception e) {
            log.warn("[aro] 笼位分配网络异常(个人Token) err={}", e.getMessage());
        }
        return false;
    }

    /**
     * 使用个人 Token 取消笼位预约。
     * 与 {@link #cancelBookCages} 相同逻辑，但使用调用者传入的个人 Token。
     */
    public boolean cancelBookCagesWithToken(List<Long> cageIds, String token) {
        if (token == null || token.isBlank()) return false;
        String urlString = "https://aro.shsmu.edu.cn/jtu/api/admin/book/cancel";
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("animalCageIdList", cageIds);
        try {
            java.net.URI uri = java.net.URI.create(urlString);
            HttpHeaders headers = new HttpHeaders();
            headers.set("Token", token);
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
            ResponseEntity<Map> response = restTemplate.exchange(uri, HttpMethod.POST, entity, Map.class);
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                Object status = response.getBody().get("status");
                if (Integer.valueOf(0).equals(status)) {
                    log.info("[aro] 取消笼位分配成功(个人Token) count={}", cageIds.size());
                    return true;
                }
                log.warn("[aro] 取消分配被拒绝(个人Token): {}", response.getBody().get("message"));
            }
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                throw new com.example.demo.modules.aro.exception.AroTokenRequiredException("ARO Token失效，请重新CAS登录");
            }
            log.warn("[aro] 取消分配请求失败(个人Token) err={}", e.getMessage());
        } catch (Exception e) {
            log.warn("[aro] 取消分配网络异常(个人Token) err={}", e.getMessage());
        }
        return false;
    }

    // ==========================================================================
    // 🔧 饲养处理业务 API（2026-07-27）
    // ==========================================================================

    /**
     * 从指定房间笼架 back 接口解析 cageBoxCode → cageBoxId + animalCageId。
     * 扫码枪扫描笼盒二维码后调用此方法获取内部 ID。
     *
     * @return Map.of("cageBoxId", Long, "animalCageId", Long) 或空 Map
     */
    @SuppressWarnings("unchecked")
    public Map<String, Long> resolveCageBoxIds(Long roomId, Long shelveId, String cageBoxCode) {
        if (roomId == null || shelveId == null || cageBoxCode == null || cageBoxCode.isBlank()) {
            return Map.of();
        }
        Map<String, Object> raw = fetchAnimalCagesByRoomAndShelve(roomId, shelveId);
        if (raw == null || raw.isEmpty()) return Map.of();
        Object dataObj = raw.get("data");
        if (!(dataObj instanceof List<?> list)) return Map.of();
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> m)) continue;
            Map<String, Object> cage = (Map<String, Object>) m;
            Map<String, Object> cageBoxVo = castMap(cage.get("cageBoxVo"));
            if (cageBoxVo == null) continue;
            String code = trim(cageBoxVo.get("cageBoxCode"));
            if (cageBoxCode.equals(code)) {
                Long cageBoxId = toLongSafe(trim(cageBoxVo.get("id")));
                Long animalCageId = toLongSafe(trim(cage.get("id")));
                if (cageBoxId != null && animalCageId != null) {
                    log.info("[aro] cageBoxCode={} → cageBoxId={} animalCageId={}", cageBoxCode, cageBoxId, animalCageId);
                    return Map.of("cageBoxId", cageBoxId, "animalCageId", animalCageId);
                }
            }
        }
        log.warn("[aro] cageBoxCode={} 未在 roomId={} shelveId={} 中找到", cageBoxCode, roomId, shelveId);
        return Map.of();
    }

    /**
     * 请分笼 / 给药 / 手术 / 采样 / 安乐死 — 统一饲养处理。
     * POST /jtu/api/admin/animalCageBoxPart/save
     */
    public boolean saveAnimalCageBoxPart(Long animalCageId, Long cageBoxId) {
        if (animalCageId == null || cageBoxId == null) return false;
        if (this.cachedToken == null && !login()) return false;
        String url = "https://aro.shsmu.edu.cn/jtu/api/admin/animalCageBoxPart/save";
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("animalCageId", animalCageId);
        body.put("cageBoxId", cageBoxId);
        try {
            java.net.URI uri = java.net.URI.create(url);
            HttpHeaders headers = getAuthHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
            ResponseEntity<Map> response = restTemplate.exchange(uri, HttpMethod.POST, entity, Map.class);
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                if (Integer.valueOf(0).equals(response.getBody().get("status"))) {
                    log.info("[aro] 饲养处理成功 animalCageId={} cageBoxId={}", animalCageId, cageBoxId);
                    return true;
                }
                Object msg = response.getBody().get("message");
                this.lastAroErrorMessage = msg != null ? String.valueOf(msg) : "饲养处理被拒";
                log.warn("[aro] 饲养处理被拒: {}", this.lastAroErrorMessage);
            }
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                this.cachedToken = null;
                if (login()) return saveAnimalCageBoxPart(animalCageId, cageBoxId);
            }
            this.lastAroErrorMessage = "饲养处理 HTTP " + e.getStatusCode().value();
            log.warn("[aro] 饲养处理请求失败 err={}", e.getMessage());
        } catch (Exception e) {
            this.lastAroErrorMessage = "饲养处理网络异常: " + e.getMessage();
            log.warn("[aro] 饲养处理网络异常 err={}", e.getMessage());
        }
        return false;
    }

    /**
     * 特殊饲养 — 标记笼盒为特殊饲养状态。
     * POST /jtu/api/admin/specialBreeding/save
     */
    public boolean saveSpecialBreeding(Long cageBoxId, String name, String description) {
        if (cageBoxId == null) return false;
        if (this.cachedToken == null && !login()) return false;
        String url = "https://aro.shsmu.edu.cn/jtu/api/admin/specialBreeding/save";
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("cageBoxId", cageBoxId);
        if (name != null && !name.isBlank()) body.put("specialBreedingName", name);
        if (description != null && !description.isBlank()) body.put("specialBreedingDescription", description);
        try {
            java.net.URI uri = java.net.URI.create(url);
            HttpHeaders headers = getAuthHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
            ResponseEntity<Map> response = restTemplate.exchange(uri, HttpMethod.POST, entity, Map.class);
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                if (Integer.valueOf(0).equals(response.getBody().get("status"))) {
                    log.info("[aro] 特殊饲养设置成功 cageBoxId={}", cageBoxId);
                    return true;
                }
                Object msg = response.getBody().get("message");
                this.lastAroErrorMessage = msg != null ? String.valueOf(msg) : "特殊饲养被拒";
                log.warn("[aro] 特殊饲养设置被拒: {}", this.lastAroErrorMessage);
            }
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                this.cachedToken = null;
                if (login()) return saveSpecialBreeding(cageBoxId, name, description);
            }
            this.lastAroErrorMessage = "特殊饲养 HTTP " + e.getStatusCode().value();
            log.warn("[aro] 特殊饲养请求失败 err={}", e.getMessage());
        } catch (Exception e) {
            this.lastAroErrorMessage = "特殊饲养网络异常: " + e.getMessage();
            log.warn("[aro] 特殊饲养网络异常 err={}", e.getMessage());
        }
        return false;
    }

    /**
     * 健康检查 — 创建实验动物健康检查单。
     * POST /jtu/api/admin/animalHealth/save
     *
     * @param healthDegree 1-轻微 2-中度 3-严重
     * @param itching      1-瘙痒 0-不瘙痒
     */
    public boolean saveAnimalHealth(Long cageBoxId, Integer healthDegree, String healthDetail,
                                    Integer itching, String reportUserName, String observeDate) {
        if (cageBoxId == null) return false;
        if (this.cachedToken == null && !login()) return false;
        String url = "https://aro.shsmu.edu.cn/jtu/api/admin/animalHealth/save";
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("cageBoxId", cageBoxId);
        if (healthDegree != null) body.put("animalHealthDegree", healthDegree);
        if (healthDetail != null && !healthDetail.isBlank()) body.put("healthDetail", healthDetail);
        if (itching != null) body.put("itching", itching);
        if (reportUserName != null && !reportUserName.isBlank()) body.put("reportUserName", reportUserName);
        if (observeDate != null && !observeDate.isBlank()) body.put("observeDate", observeDate);
        try {
            java.net.URI uri = java.net.URI.create(url);
            HttpHeaders headers = getAuthHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
            ResponseEntity<Map> response = restTemplate.exchange(uri, HttpMethod.POST, entity, Map.class);
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                if (Integer.valueOf(0).equals(response.getBody().get("status"))) {
                    log.info("[aro] 健康检查创建成功 cageBoxId={}", cageBoxId);
                    return true;
                }
                Object msg = response.getBody().get("message");
                this.lastAroErrorMessage = msg != null ? String.valueOf(msg) : "健康检查被拒";
                log.warn("[aro] 健康检查创建被拒: {}", this.lastAroErrorMessage);
            }
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                this.cachedToken = null;
                if (login()) return saveAnimalHealth(cageBoxId, healthDegree, healthDetail, itching, reportUserName, observeDate);
            }
            this.lastAroErrorMessage = "健康检查 HTTP " + e.getStatusCode().value();
            log.warn("[aro] 健康检查请求失败 err={}", e.getMessage());
        } catch (Exception e) {
            this.lastAroErrorMessage = "健康检查网络异常: " + e.getMessage();
            log.warn("[aro] 健康检查网络异常 err={}", e.getMessage());
        }
        return false;
    }

    /**
     * 全局检索：遍历所有已知 (roomId, shelveId) 查找 cageBoxCode。
     * 扫码枪传入笼盒编号 → 逐个笼架调 /back → 返回匹配的内部 ID。
     *
     * @param shelfList 从 cage_shelf_index 获取的全部 [{roomId, shelveId}]
     */
    @SuppressWarnings("unchecked")
    public Map<String, Long> findCageBoxByCode(String cageBoxCode, List<Map<String, Object>> shelfList) {
        if (cageBoxCode == null || cageBoxCode.isBlank() || shelfList == null || shelfList.isEmpty()) {
            return Map.of();
        }
        for (Map<String, Object> shelf : shelfList) {
            Long roomId = toLongSafe(trim(shelf.get("roomId")));
            Long shelveId = toLongSafe(trim(shelf.get("shelveId")));
            if (roomId == null || shelveId == null) continue;
            Map<String, Long> found = resolveCageBoxIds(roomId, shelveId, cageBoxCode);
            if (!found.isEmpty()) return found;
        }
        log.warn("[aro] 全局检索 cageBoxCode={} 未在任何笼架中找到", cageBoxCode);
        return Map.of();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> castMap(Object o) {
        if (o instanceof Map<?, ?> m) return (Map<String, Object>) m;
        return null;
    }

    private static String trim(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }

    private static Long toLongSafe(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        try { return Long.parseLong(String.valueOf(v).trim()); } catch (NumberFormatException e) { return null; }
    }

    // ==========================================================================
    // 🔧 笼位预约管理 API（2026-07-28，使用个人 Token）
    // ==========================================================================

    /**
     * 跨房间搜索 AUP 分配。
     * 先拉房间列表，再逐个查 AUP 明细，匹配 keyword（AUP编号/课题组长）。
     * 匹配到 1 个以上房间即停止。
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> searchAupsAcrossRooms(String keyword, String token) {
        if (token == null || token.isBlank() || keyword == null || keyword.isBlank()) {
            return Collections.emptyList();
        }
        String kw = keyword.trim().toLowerCase();
        List<Map<String, Object>> results = new ArrayList<>();

        // 先拿到全量房间列表
        Map<String, Object> roomListRaw = fetchRoomRentList(1, 200, token);
        Object dataObj = roomListRaw.get("data");
        if (!(dataObj instanceof Map<?, ?> dm)) return results;
        Object listObj = ((Map<String, Object>) dm).get("list");
        if (!(listObj instanceof List<?> roomList)) return results;

        for (Object roomObj : roomList) {
            if (!(roomObj instanceof Map<?, ?> rm)) continue;
            String roomId = trim(((Map<String, Object>) rm).get("roomId"));
            String roomName = trim(((Map<String, Object>) rm).get("name"));
            if (roomId.isEmpty()) continue;

            Map<String, Object> aupRaw = fetchRoomRentAups(roomId, 1, 100, token);
            Object aupData = aupRaw.get("data");
            List<?> aupList = null;
            if (aupData instanceof List<?> al) {
                aupList = al;
            } else if (aupData instanceof Map<?, ?> adm) {
                Object nested = ((Map<String, Object>) adm).get("data");
                if (nested instanceof List<?> nl) aupList = nl;
            }

            if (aupList == null) continue;
            for (Object aupObj : aupList) {
                if (!(aupObj instanceof Map<?, ?> am)) continue;
                String regNum = trim(((Map<String, Object>) am).get("registerNumber")).toLowerCase();
                String piName = trim(((Map<String, Object>) am).get("piName")).toLowerCase();
                if (regNum.contains(kw) || piName.contains(kw)) {
                    Map<String, Object> hit = new LinkedHashMap<>();
                    hit.put("roomId", roomId);
                    hit.put("roomName", roomName);
                    hit.put("piName", trim(((Map<String, Object>) am).get("piName")));
                    hit.put("registerNumber", trim(((Map<String, Object>) am).get("registerNumber")));
                    hit.put("aupId", trim(((Map<String, Object>) am).get("aupId")));
                    hit.put("rentNumber", ((Map<String, Object>) am).get("rentNumber"));
                    results.add(hit);
                    break; // 每个房间只记录一次
                }
            }
            // 限制：找到 10 个匹配房间后停止，避免请求过多
            if (results.size() >= 10) break;
        }
        return results;
    }

    /**
     * 房间预约汇总列表。
     * GET /jtu/api/admin/room/rent/list?pageSize=&pageNum=
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> fetchRoomRentList(int pageNum, int pageSize, String token) {
        if (token == null || token.isBlank()) return Map.of();
        String urlString = "https://aro.shsmu.edu.cn/jtu/api/admin/room/rent/list?pageSize=" + pageSize + "&pageNum=" + pageNum;
        try {
            java.net.URI uri = java.net.URI.create(urlString);
            HttpHeaders headers = new HttpHeaders();
            headers.set("Token", token);
            HttpEntity<String> entity = new HttpEntity<>(headers);
            ResponseEntity<Map> response = restTemplate.exchange(uri, HttpMethod.GET, entity, Map.class);
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return (Map<String, Object>) response.getBody();
            }
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                throw new com.example.demo.modules.aro.exception.AroTokenRequiredException("ARO Token失效，请重新CAS登录");
            }
            log.warn("[aro] 房间预约列表查询失败 err={}", e.getMessage());
        } catch (Exception e) {
            log.warn("[aro] 房间预约列表网络异常 err={}", e.getMessage());
        }
        return Map.of();
    }

    /**
     * 房间内 AUP 分配明细。
     * GET /jtu/api/admin/room/rent/prepare/aups?roomId=X&pageSize=&pageNum=
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> fetchRoomRentAups(String roomId, int pageNum, int pageSize, String token) {
        if (token == null || token.isBlank() || roomId == null || roomId.isBlank()) return Map.of();
        String urlString = "https://aro.shsmu.edu.cn/jtu/api/admin/room/rent/prepare/aups?roomId=" + roomId + "&pageSize=" + pageSize + "&pageNum=" + pageNum;
        try {
            java.net.URI uri = java.net.URI.create(urlString);
            HttpHeaders headers = new HttpHeaders();
            headers.set("Token", token);
            HttpEntity<String> entity = new HttpEntity<>(headers);
            ResponseEntity<Map> response = restTemplate.exchange(uri, HttpMethod.GET, entity, Map.class);
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return (Map<String, Object>) response.getBody();
            }
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                throw new com.example.demo.modules.aro.exception.AroTokenRequiredException("ARO Token失效，请重新CAS登录");
            }
            log.warn("[aro] AUP分配明细查询失败 err={}", e.getMessage());
        } catch (Exception e) {
            log.warn("[aro] AUP分配明细网络异常 err={}", e.getMessage());
        }
        return Map.of();
    }

    /**
     * 新增/编辑 AUP 分配。
     * POST /jtu/api/admin/room/rent/prepare
     * Body: { aupId, roomId, rentNumber, memo, id? }
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> saveRoomRentPrepare(Map<String, Object> body, String token) {
        if (token == null || token.isBlank()) return Map.of();
        String urlString = "https://aro.shsmu.edu.cn/jtu/api/admin/room/rent/prepare";
        try {
            java.net.URI uri = java.net.URI.create(urlString);
            HttpHeaders headers = new HttpHeaders();
            headers.set("Token", token);
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
            ResponseEntity<Map> response = restTemplate.exchange(uri, HttpMethod.POST, entity, Map.class);
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return (Map<String, Object>) response.getBody();
            }
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                throw new com.example.demo.modules.aro.exception.AroTokenRequiredException("ARO Token失效，请重新CAS登录");
            }
            log.warn("[aro] AUP分配保存失败 err={}", e.getMessage());
        } catch (Exception e) {
            log.warn("[aro] AUP分配保存网络异常 err={}", e.getMessage());
        }
        return Map.of();
    }

    /**
     * 删除 AUP 分配。
     * POST /jtu/api/admin/room/rent/prepare/delete
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> deleteRoomRentPrepare(Map<String, Object> body, String token) {
        if (token == null || token.isBlank()) return Map.of();
        String urlString = "https://aro.shsmu.edu.cn/jtu/api/admin/room/rent/prepare/delete";
        try {
            java.net.URI uri = java.net.URI.create(urlString);
            HttpHeaders headers = new HttpHeaders();
            headers.set("Token", token);
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
            ResponseEntity<Map> response = restTemplate.exchange(uri, HttpMethod.POST, entity, Map.class);
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return (Map<String, Object>) response.getBody();
            }
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                throw new com.example.demo.modules.aro.exception.AroTokenRequiredException("ARO Token失效，请重新CAS登录");
            }
            log.warn("[aro] AUP分配删除失败 err={}", e.getMessage());
        } catch (Exception e) {
            log.warn("[aro] AUP分配删除网络异常 err={}", e.getMessage());
        }
        return Map.of();
    }

    // ==========================================================================
    // 🔧 笼位绑定 / 状态取消 API（2026-07-30）
    // ==========================================================================

    /**
     * 笼盒关联到笼位。
     * POST /jtu/api/admin/cageRelatedBox/save
     */
    public boolean saveCageRelatedBox(Long animalCageId, String cageBoxCode) {
        if (animalCageId == null || cageBoxCode == null || cageBoxCode.isBlank()) return false;
        if (this.cachedToken == null && !login()) return false;
        String url = "https://aro.shsmu.edu.cn/jtu/api/admin/cageRelatedBox/save";
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("animalCageId", animalCageId);
        body.put("cageBoxCode", cageBoxCode);
        try {
            java.net.URI uri = java.net.URI.create(url);
            HttpHeaders headers = getAuthHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
            ResponseEntity<Map> response = restTemplate.exchange(uri, HttpMethod.POST, entity, Map.class);
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                if (Integer.valueOf(0).equals(response.getBody().get("status"))) {
                    log.info("[aro] 笼盒关联成功 animalCageId={} cageBoxCode={}", animalCageId, cageBoxCode);
                    return true;
                }
                String aroMsg = String.valueOf(response.getBody().getOrDefault("message", ""));
                this.lastAroErrorMessage = aroMsg.isBlank() ? "课题组与AUP不符" : aroMsg;
                log.warn("[aro] 笼盒关联被拒 animalCageId={} cageBoxCode={} status={} message={} fullBody={}",
                        animalCageId, cageBoxCode, response.getBody().get("status"),
                        aroMsg, response.getBody());
            }
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                this.cachedToken = null;
                if (login()) return saveCageRelatedBox(animalCageId, cageBoxCode);
            }
            this.lastAroErrorMessage = "笼盒关联 HTTP " + e.getStatusCode().value();
            log.warn("[aro] 笼盒关联请求失败 err={}", e.getMessage());
        } catch (Exception e) {
            this.lastAroErrorMessage = "笼盒关联网络异常: " + e.getMessage();
            log.warn("[aro] 笼盒关联网络异常 err={}", e.getMessage());
        }
        return false;
    }

    /**
     * 笼盒解绑（批量删除笼盒关联）。
     * POST /jtu/api/admin/cageBox/batchDelete
     */
    @SuppressWarnings("unchecked")
    public boolean unbindCageBox(List<Long> animalCageIdList) {
        if (animalCageIdList == null || animalCageIdList.isEmpty()) return false;
        if (this.cachedToken == null && !login()) return false;
        String url = "https://aro.shsmu.edu.cn/jtu/api/admin/cageBox/batchDelete";
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("animalCageIdList", animalCageIdList);
        try {
            java.net.URI uri = java.net.URI.create(url);
            HttpHeaders headers = getAuthHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
            ResponseEntity<Map> response = restTemplate.exchange(uri, HttpMethod.POST, entity, Map.class);
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                if (Integer.valueOf(0).equals(response.getBody().get("status"))) {
                    log.info("[aro] 笼盒解绑成功 ids={}", animalCageIdList);
                    return true;
                }
                String msg = String.valueOf(response.getBody().getOrDefault("message", ""));
                this.lastAroErrorMessage = msg.isBlank() ? "解绑失败" : msg;
                log.warn("[aro] 笼盒解绑被拒 ids={} message={}", animalCageIdList, msg);
            }
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                this.cachedToken = null;
                if (login()) return unbindCageBox(animalCageIdList);
            }
            this.lastAroErrorMessage = "笼盒解绑 HTTP " + e.getStatusCode().value();
            log.warn("[aro] 笼盒解绑请求失败 err={}", e.getMessage());
        } catch (Exception e) {
            this.lastAroErrorMessage = "笼盒解绑网络异常: " + e.getMessage();
            log.warn("[aro] 笼盒解绑网络异常 err={}", e.getMessage());
        }
        return false;
    }

    /**
     * 【调试用】笼盒关联到笼位 — 返回 ARO 原始响应。
     * POST /jtu/api/admin/cageRelatedBox/save
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> saveCageRelatedBoxRaw(Long animalCageId, String cageBoxCode) {
        if (animalCageId == null || cageBoxCode == null || cageBoxCode.isBlank()) return Map.of("error", "参数为空");
        if (this.cachedToken == null && !login()) return Map.of("error", "ARO 登录失败");
        String url = "https://aro.shsmu.edu.cn/jtu/api/admin/cageRelatedBox/save";
        Map<String, Object> reqBody = new LinkedHashMap<>();
        reqBody.put("animalCageId", animalCageId);
        reqBody.put("cageBoxCode", cageBoxCode);
        log.info("[aro-debug] cageRelatedBox/save 请求: animalCageId={} cageBoxCode={}", animalCageId, cageBoxCode);
        try {
            java.net.URI uri = java.net.URI.create(url);
            HttpHeaders headers = getAuthHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(reqBody, headers);
            ResponseEntity<Map> response = restTemplate.exchange(uri, HttpMethod.POST, entity, Map.class);
            Map<String, Object> rb = response.getBody();
            log.info("[aro-debug] cageRelatedBox/save 响应: httpStatus={} body={}", response.getStatusCode().value(), rb);
            if (rb != null) return rb;
            return Map.of("httpStatus", response.getStatusCode().value());
        } catch (HttpClientErrorException e) {
            log.warn("[aro-debug] 请求失败 httpStatus={} msg={}", e.getStatusCode().value(), e.getMessage());
            return Map.of("error", "HTTP " + e.getStatusCode().value(), "message", e.getMessage());
        } catch (Exception e) {
            log.warn("[aro-debug] 网络异常 msg={}", e.getMessage());
            return Map.of("error", "网络异常", "message", e.getMessage());
        }
    }

    /**
     * 更新笼位属性（含 qrcode / state / type 等）。
     * POST /jtu/api/admin/animalCage/update
     */
    @SuppressWarnings("unchecked")
    public boolean updateAnimalCage(Map<String, Object> body) {
        if (body == null || body.isEmpty()) return false;
        if (this.cachedToken == null && !login()) return false;
        // 前端传字符串 ID 防精度丢失，这里转回 Long 给 ARO
        String[] numFields = {"id", "roomId", "shelveId", "state", "type", "typeId", "orders"};
        for (String f : numFields) {
            Object v = body.get(f);
            if (v instanceof String s) {
                try { body.put(f, Long.parseLong(s.trim())); }
                catch (NumberFormatException ignored) {}
            }
        }
        String url = "https://aro.shsmu.edu.cn/jtu/api/admin/animalCage/update";
        try {
            java.net.URI uri = java.net.URI.create(url);
            HttpHeaders headers = getAuthHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
            ResponseEntity<Map> response = restTemplate.exchange(uri, HttpMethod.POST, entity, Map.class);
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                Map<String,Object> rb = response.getBody();
                log.info("[aro-debug] animalCage/update 原始响应: status={} type={} body={}",
                        rb.get("status"), rb.get("status")!=null?rb.get("status").getClass().getSimpleName():"null", rb);
                if (Integer.valueOf(0).equals(rb.get("status"))) {
                    log.info("[aro] 笼位更新成功 id={}", body.get("id"));
                    return true;
                }
                Object msg = rb.get("message");
                this.lastAroErrorMessage = msg != null ? String.valueOf(msg) : "笼位更新被拒";
                log.warn("[aro] 笼位更新被拒: {}", this.lastAroErrorMessage);
            }
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                this.cachedToken = null;
                if (login()) return updateAnimalCage(body);
            }
            this.lastAroErrorMessage = "笼位更新 HTTP " + e.getStatusCode().value();
            log.warn("[aro] 笼位更新请求失败 err={}", e.getMessage());
        } catch (Exception e) {
            this.lastAroErrorMessage = "笼位更新网络异常: " + e.getMessage();
            log.warn("[aro] 笼位更新网络异常 err={}", e.getMessage());
        }
        return false;
    }

    /**
     * 取消笼盒颜色/状态。
     * POST /jtu/api/admin/cageBox/cancelColor
     *
     * @param cageBoxId 笼盒 ID
    /**
     * 保存/更新笼位（upsert：有 id 则修改，无 id 则新增）。
     * POST /jtu/api/admin/animalCage/save
     */
    public boolean saveAnimalCage(Map<String, Object> body) {
        if (body == null || body.isEmpty()) return false;
        if (this.cachedToken == null && !login()) return false;
        String[] numFields = {"id", "roomId", "shelveId", "state", "type", "typeId", "orders"};
        for (String f : numFields) {
            Object v = body.get(f);
            if (v instanceof String s) {
                try { body.put(f, Long.parseLong(s.trim())); }
                catch (NumberFormatException ignored) {}
            }
        }
        String url = "https://aro.shsmu.edu.cn/jtu/api/admin/animalCage/save";
        try {
            java.net.URI uri = java.net.URI.create(url);
            HttpHeaders headers = getAuthHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
            ResponseEntity<Map> response = restTemplate.exchange(uri, HttpMethod.POST, entity, Map.class);
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                Map<String,Object> rb = response.getBody();
                log.info("[aro-debug] animalCage/save 原始响应: status={} type={} body={}",
                        rb.get("status"), rb.get("status")!=null?rb.get("status").getClass().getSimpleName():"null", rb);
                if (Integer.valueOf(0).equals(rb.get("status"))) {
                    log.info("[aro] 笼位保存成功 id={}", body.get("id"));
                    return true;
                }
                log.warn("[aro] 笼位保存被拒: {}", rb.get("message"));
            }
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                this.cachedToken = null;
                if (login()) return saveAnimalCage(body);
            }
            log.warn("[aro] 笼位保存请求失败 err={}", e.getMessage());
        } catch (Exception e) {
            log.warn("[aro] 笼位保存网络异常 err={}", e.getMessage());
        }
        return false;
    }

    /**
     * @param color     1=取消特殊饲养红 2=取消请分笼橙 3=取消健康异查蓝
     */
    public boolean cancelCageBoxColor(Long cageBoxId, Integer color) {
        if (cageBoxId == null || color == null) return false;
        if (this.cachedToken == null && !login()) return false;
        String url = "https://aro.shsmu.edu.cn/jtu/api/admin/cageBox/cancelColor";
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", cageBoxId);
        body.put("color", color);
        try {
            java.net.URI uri = java.net.URI.create(url);
            HttpHeaders headers = getAuthHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
            ResponseEntity<Map> response = restTemplate.exchange(uri, HttpMethod.POST, entity, Map.class);
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                if (Integer.valueOf(0).equals(response.getBody().get("status"))) {
                    log.info("[aro] 取消笼盒颜色成功 cageBoxId={} color={}", cageBoxId, color);
                    return true;
                }
                Object msg = response.getBody().get("message");
                this.lastAroErrorMessage = msg != null ? String.valueOf(msg) : "取消笼盒颜色被拒";
                log.warn("[aro] 取消笼盒颜色被拒: {}", this.lastAroErrorMessage);
            }
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                this.cachedToken = null;
                if (login()) return cancelCageBoxColor(cageBoxId, color);
            }
            this.lastAroErrorMessage = "取消笼盒颜色 HTTP " + e.getStatusCode().value();
            log.warn("[aro] 取消笼盒颜色请求失败 err={}", e.getMessage());
        } catch (Exception e) {
            this.lastAroErrorMessage = "取消笼盒颜色网络异常: " + e.getMessage();
            log.warn("[aro] 取消笼盒颜色网络异常 err={}", e.getMessage());
        }
        return false;
    }

    /**
     * 根据笼盒 ID 查询课题组成员。
     * GET /jtu/api/projectGroup/getMemberByCageBoxId?cageBoxId=xxx
     *
     * @return [{ id, jobNumber, name }]
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> getProjectGroupMembersByCageBoxId(Long cageBoxId) {
        if (cageBoxId == null) return Collections.emptyList();
        if (this.cachedToken == null && !login()) return Collections.emptyList();
        String urlString = "https://aro.shsmu.edu.cn/jtu/api/projectGroup/getMemberByCageBoxId?cageBoxId=" + cageBoxId;
        try {
            java.net.URI uri = java.net.URI.create(urlString);
            HttpEntity<String> entity = new HttpEntity<>(null, getAuthHeaders());
            ResponseEntity<Map> response = restTemplate.exchange(uri, HttpMethod.GET, entity, Map.class);
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                Map<String, Object> body = response.getBody();
                log.info("[aro] getMemberByCageBoxId raw: status={} dataType={}",
                        body.get("status"), body.get("data") == null ? "null" : body.get("data").getClass().getSimpleName());
                Object data = body.get("data");
                if (data instanceof List<?> list) {
                    List<Map<String, Object>> members = new ArrayList<>();
                    for (Object item : list) {
                        if (item instanceof Map<?, ?> m) members.add((Map<String, Object>) m);
                    }
                    log.info("[aro] 课题组成员查询 cageBoxId={} count={}", cageBoxId, members.size());
                    return members;
                }
                // data 不是 List——可能是空或包装了一层
                log.warn("[aro] getMemberByCageBoxId data 不是 List: cageBoxId={} body={}",
                        cageBoxId, body);
            }
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                this.cachedToken = null;
                if (login()) return getProjectGroupMembersByCageBoxId(cageBoxId);
            }
            log.warn("[aro] 课题组成员查询失败 cageBoxId={} err={}", cageBoxId, e.getMessage());
        } catch (Exception e) {
            log.warn("[aro] 课题组成员查询网络异常 cageBoxId={} err={}", cageBoxId, e.getMessage());
        }
        return Collections.emptyList();
    }

    /**
     * 🔍 批量笼位列表 — /admin/animalCage/list?roomId=X&shelveId=Y&pageSize=100
     * 返回完整 cageBoxVo（含动物品系/性别/周龄/实验员等 /back 不返回的字段）。
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> fetchAnimalCageList(Long roomId, Long shelveId, int pageNum, int pageSize) {
        if (this.cachedToken == null && !login()) return Collections.emptyList();
        StringBuilder url = new StringBuilder("https://aro.shsmu.edu.cn/jtu/api/admin/animalCage/list?pageNum=")
                .append(pageNum).append("&pageSize=").append(pageSize);
        if (roomId != null) url.append("&roomId=").append(roomId);
        if (shelveId != null) url.append("&shelveId=").append(shelveId);
        try {
            java.net.URI uri = java.net.URI.create(url.toString());
            HttpEntity<String> entity = new HttpEntity<>(null, getAuthHeaders());
            ResponseEntity<Map> response = restTemplate.exchange(uri, HttpMethod.GET, entity, Map.class);
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                Object data = response.getBody().get("data");
                if (data instanceof Map<?, ?> dm) {
                    Object list = dm.get("list");
                    if (list instanceof List<?> l) return (List<Map<String, Object>>) l;
                }
            }
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) { this.cachedToken = null; if (login()) return fetchAnimalCageList(roomId, shelveId, pageNum, pageSize); }
            log.warn("[aro] 笼位列表拉取失败 roomId={} shelveId={} err={}", roomId, shelveId, e.getMessage());
        } catch (Exception e) {
            log.warn("[aro] 笼位列表网络异常 roomId={} shelveId={} err={}", roomId, shelveId, e.getMessage());
        }
        return Collections.emptyList();
    }

    /** 按 shelveId 全量拉取（自动分页） */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> fetchAllAnimalCagesByShelveId(Long shelveId) {
        List<Map<String, Object>> all = new ArrayList<>();
        int page = 1;
        while (true) {
            List<Map<String, Object>> batch = fetchAnimalCageList(null, shelveId, page, 100);
            if (batch.isEmpty()) break;
            all.addAll(batch);
            if (batch.size() < 100) break;
            page++;
            try { Thread.sleep(150); } catch (InterruptedException e) { break; }
        }
        return all;
    }
}