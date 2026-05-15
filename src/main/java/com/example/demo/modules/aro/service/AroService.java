package com.example.demo.modules.aro.service;

import com.alibaba.fastjson2.JSON;
import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.dto.AroRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;
import javax.annotation.PostConstruct; // 注意顶部要补上这个导入

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class AroService {

    private static final Logger log = LoggerFactory.getLogger(AroService.class);

    @Autowired
    private RestTemplate restTemplate;

    private String cachedToken = null;
    private volatile String lastAroErrorMessage = "";

    // 🚨 你的 ARO 系统真实账号和密码
    private final String account = "15001771038";
    private final String password = "88888888";

    @PostConstruct
    public void forceInitialLogin() {
        System.out.println("\n🔥 [系统点火] 正在优先抢占 ARO 官方全局 Token，阻塞其他无关任务...");
        boolean success = login();
        if (success) {
            System.out.println("✅ [系统点火] ARO Token 抢占成功！主电源已合闸，放行后续自检与雷达订阅！\n");
        } else {
            System.err.println("❌ [系统点火] ARO Token 获取失败，请检查账号密码或网络！\n");
        }
    }

    /**
     * 1. 模拟蓝图的 FetchToken：去 ARO 拿 Token
     */
    public boolean login() {
        String url = "https://aro.shsmu.edu.cn/jtu/api/login";
        Map<String, String> body = new HashMap<>();
        body.put("account", account);
        body.put("password", password);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, String>> request = new HttpEntity<>(body, headers);

        try {
            System.out.println("🔄 [ARO] 正在请求登录获取 Token...");
            Map response = restTemplate.postForObject(url, request, Map.class);

            if (response != null && response.containsKey("data")) {
                Map data = (Map) response.get("data");
                if (data.containsKey("token")) {
                    this.cachedToken = (String) data.get("token");
                    this.lastAroErrorMessage = "";
                    System.out.println("✅ [ARO] 登录成功！已获取最新 Token。");
                    return true;
                }
            }
            this.lastAroErrorMessage = "ARO 登录失败: 返回体缺少 token";
        } catch (Exception e) {
            this.lastAroErrorMessage = "ARO 登录失败: " + e.getMessage();
            System.err.println("❌ [ARO] 登录失败: " + e.getClass().getSimpleName() + " - " + e.getMessage());
        }
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
                System.out.println("⚠️ [ARO] Token 已过期，正在重新登录...");
                this.cachedToken = null;
                if (login()) {
                    return fetchRecordsByCondition(rangeDate, state, pageNum, pageSize);
                }
            }
            System.err.println("❌ [ARO] 拉取记录报错: " + e.getMessage());
            return new ArrayList<>();
        } catch (Exception e) {
            System.err.println("❌ [ARO] 网络异常: " + e.getMessage());
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

        System.out.println("👻 [人员资料收割机] 开始启动，准备从官方 ARO 扒取全量数据...");

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
                            System.out.println("✅ 已获取第 " + pageNum + " 页数据，当前累计人数: " + allPersonnel.size());
                            pageNum++;
                            Thread.sleep(800); // 战术停顿 0.8 秒，防封杀
                        }
                    } else {
                        keepFetching = false;
                    }
                }
            } catch (Exception e) {
                System.err.println("❌ [人员资料拉取失败] 第 " + pageNum + " 页异常: " + e.getMessage());
                keepFetching = false;
            }
        }

        System.out.println("🎉 [人员资料收割机] 任务完成！共计获取: " + allPersonnel.size() + " 人！");
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
            System.err.println("❌ [ARO] 人员检索回源失败: " + e.getMessage());
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
        if (this.cachedToken == null && !login()) return new ArrayList<>();

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
                    return parsed;
                }
                System.err.println("⚠️ [ARO-探测] 可进入房间返回格式异常 | userId=" + userId);
            }
        } catch (org.springframework.web.client.HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                this.cachedToken = null;
                if (login()) return getExamOfflineRoom(userId);
            }
            System.err.println("❌ [ARO-探测] 可进入房间查询失败 | userId=" + userId + " | err=" + e.getMessage());
        } catch (Exception e) {
            System.err.println("❌ [ARO-探测] 可进入房间查询异常 | userId=" + userId + " | err=" + e.getMessage());
        }
        return new ArrayList<>();
    }

    // ==============================================================================
    // 💥 2. 获取滞留未离开的房间 (完美适配官方 GET 接口 + Query 传参)
    // ==============================================================================
    public List<Map<String, Object>> getNoLeaveRoom(String userId) {
        if (this.cachedToken == null && !login()) {
            if (this.lastAroErrorMessage == null || this.lastAroErrorMessage.isBlank()) {
                this.lastAroErrorMessage = "探测滞留空间失败: 登录 ARO 失败";
            }
            return null;
        }

        // 💥 修复点 1：完全换成官方最新 URL，并将 userId 作为 Query 参数拼在后面！
        String urlString = "https://aro.shsmu.edu.cn/jtu/api/admin/user/noLeaveRoom?userId=" + userId;

        try {
            java.net.URI uri = java.net.URI.create(urlString);

            // 💥 修复点 2：GET 请求不需要 Body，传入 null 即可
            HttpEntity<String> entity = new HttpEntity<>(null, getAuthHeaders());

            // 💥 修复点 3：强制改为 HttpMethod.GET
            ResponseEntity<Map> response = restTemplate.exchange(uri, HttpMethod.GET, entity, Map.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                Object data = response.getBody().get("data");
                List<Map<String, Object>> parsed = tryParseRoomList(data);
                if (parsed != null) {
                    this.lastAroErrorMessage = "";
                    return parsed;
                }
                Object msg = response.getBody().get("message");
                Object status = response.getBody().get("status");
                String dataType = (data == null) ? "null" : data.getClass().getName();
                this.lastAroErrorMessage = "探测滞留空间失败: 返回数据格式异常"
                        + (msg != null ? ("，message=" + msg) : "");
                log.warn("[aro] noLeaveRoom 数据格式异常 userId={} message={}", userId, msg);
                return null;
            }
            this.lastAroErrorMessage = "探测滞留空间失败: HTTP " + response.getStatusCodeValue();
            return null;
        } catch (org.springframework.web.client.HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                this.cachedToken = null;
                if (login()) return getNoLeaveRoom(userId);
            }
            this.lastAroErrorMessage = "探测滞留空间失败: " + e.getStatusCode().value() + " " + e.getStatusText();
            System.err.println("❌ [ARO 响应] 探测滞留失败: " + e.getMessage());
        } catch (Exception e) {
            this.lastAroErrorMessage = "探测滞留空间失败: " + e.getMessage();
            System.err.println("❌ [ARO 崩溃] 探测滞留异常: " + e.getMessage());
        }
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
                System.err.println("❌ [ARO 响应] HTTP 非成功状态: " + response.getStatusCodeValue());
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
                if (login()) return submitAccessRecord(userId, roomId, accessType);
            }
            this.lastAroErrorMessage = "ARO 请求失败: " + e.getStatusCode().value() + " " + e.getStatusText();
            System.err.println("❌ [ARO 响应] 官方系统拒绝: " + e.getMessage());
        } catch (Exception e) {
            this.lastAroErrorMessage = "ARO 请求异常: " + e.getMessage();
            System.err.println("❌ [ARO 崩溃] 提交门禁记录断网或超时: " + e.getMessage());
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
        System.out.println("🌐 [ARO 请求] 拉取动物订单 page=" + pageNum + ", size=" + pageSize);

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
                    System.err.println("❌ [ARO 响应] 接口拒绝: " + response.getBody().get("message"));
                }
            }
        } catch (org.springframework.web.client.HttpClientErrorException e) {
            // 完美照抄你们的 401 自动重登录机制！
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                System.out.println("⚠️ [ARO] Token 已过期，正在重新登录并无缝重试...");
                this.cachedToken = null;
                if (login()) return fetchAnimalOrderPage(pageNum, pageSize);
            }
            System.err.println("❌ [ARO 响应] 拉取订单失败: " + e.getMessage());
        } catch (Exception e) {
            System.err.println("❌ [ARO 崩溃] 拉取订单异常: " + e.getMessage());
        }
        return null;
    }

    // ==============================================================================
    // 💥 5. 获取人员详情状态与惩戒记录 (完美解析 State)
    // ==============================================================================
    public Map<String, Object> getUserDetailAndDisciplinary(String userId) {
        if (this.cachedToken == null && !login()) return null;

        String urlString = "https://aro.shsmu.edu.cn/jtu/api/admin/user/detail?id=" + userId;

        try {
            java.net.URI uri = java.net.URI.create(urlString);
            HttpEntity<String> entity = new HttpEntity<>(null, getAuthHeaders());
            ResponseEntity<Map> response = restTemplate.exchange(uri, HttpMethod.GET, entity, Map.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                // 剥离外壳，直接把含 state 和 userDisciplinaryRecords 的 data 扔给前端
                return (Map<String, Object>) response.getBody().get("data");
            }
        } catch (org.springframework.web.client.HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                this.cachedToken = null;
                if (login()) return getUserDetailAndDisciplinary(userId);
            }
            log.warn("[aro] 人员详情查询失败 userId={} err={}", userId, e.getMessage());
        } catch (Exception e) {
            log.warn("[aro] 人员详情网络异常 userId={} err={}", userId, e.getMessage());
        }
        return null;
    }

    // ==============================================================================
    // 💥 6. 强行修改人员状态 (解封 / 封禁)
    // ==============================================================================
    public boolean updateUserState(String userId, boolean valid) {
        if (this.cachedToken == null && !login()) return false;

        String urlString = "https://aro.shsmu.edu.cn/jtu/api/admin/user/updateState";
        System.out.println("⚡ [风控执行] 正在" + (valid ? "解封" : "封禁") + "人员: " + userId);

        Map<String, Object> body = new HashMap<>();
        body.put("userId", userId);
        body.put("valid", valid);
        body.put("invalidReason", null);

        try {
            java.net.URI uri = java.net.URI.create(urlString);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, getAuthHeaders());
            ResponseEntity<Map> response = restTemplate.exchange(uri, HttpMethod.POST, entity, Map.class);

            if (response.getStatusCode().is2xxSuccessful()) {
                System.out.println("✅ [风控执行] 状态修改成功！");
                return true;
            }
        } catch (org.springframework.web.client.HttpClientErrorException e) {
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                this.cachedToken = null;
                if (login()) return updateUserState(userId, valid);
            }
            System.err.println("❌ [风控执行] 修改失败: " + e.getMessage());
        } catch (Exception e) {
            System.err.println("❌ [风控执行] 网络异常: " + e.getMessage());
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

}