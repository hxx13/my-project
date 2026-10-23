package com.example.demo.modules.dahua.service;

import com.example.demo.modules.dahua.entity.DahuaDeviceChannelCache;
import com.example.demo.modules.dahua.mapper.DahuaDepartmentCacheMapper;
import com.example.demo.modules.dahua.mapper.DahuaDeviceChannelCacheMapper;
import com.example.demo.modules.dahua.mapper.DahuaDoorChannelGroupMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 门组分配 / 按人授权的上游代理。所有写操作都直接落大华平台，本地不另存。
 */
@Service
public class DahuaDoorAdminService {
    private static final DateTimeFormatter CODE_DATE = DateTimeFormatter.ofPattern("yyyyMMdd");

    private final DahuaOpenApiService openApiService;
    private final DahuaDepartmentCacheMapper departmentMapper;
    private final DahuaDeviceChannelCacheMapper channelMapper;
    private final DahuaDoorChannelGroupMapper channelGroupMapper;

    public DahuaDoorAdminService(DahuaOpenApiService openApiService,
                                 DahuaDepartmentCacheMapper departmentMapper,
                                 DahuaDeviceChannelCacheMapper channelMapper,
                                 DahuaDoorChannelGroupMapper channelGroupMapper) {
        this.openApiService = openApiService;
        this.departmentMapper = departmentMapper;
        this.channelMapper = channelMapper;
        this.channelGroupMapper = channelGroupMapper;
    }

    /** 门禁通道编组列表（channelCodes 拆成数组返回） */
    public List<Map<String, Object>> listChannelGroups() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (var g : channelGroupMapper.listAll()) {
            List<String> codes = new ArrayList<>();
            String raw = g.getChannelCodes() == null ? "" : g.getChannelCodes();
            for (String c : raw.split(",")) {
                if (StringUtils.hasText(c)) codes.add(c.trim());
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", g.getId());
            row.put("name", g.getName());
            row.put("channelCodes", codes);
            row.put("updatedAt", g.getUpdatedAt());
            out.add(row);
        }
        return out;
    }

    /** 保存编组；同名覆盖 */
    public void saveChannelGroup(String name, List<String> channelCodes) {
        String n = name == null ? "" : name.trim();
        if (n.isEmpty()) throw new IllegalArgumentException("编组名称不能为空");
        if (n.length() > 64) throw new IllegalArgumentException("编组名称不能超过 64 个字符");
        List<String> codes = new ArrayList<>();
        if (channelCodes != null) {
            for (String c : channelCodes) {
                if (StringUtils.hasText(c)) codes.add(c.trim());
            }
        }
        if (codes.isEmpty()) throw new IllegalArgumentException("请至少选择一个门禁通道");
        channelGroupMapper.upsert(n, String.join(",", codes));
    }

    public void deleteChannelGroup(long id) {
        channelGroupMapper.deleteById(id);
    }

    public List<Map<String, Object>> listDoorGroups() {
        return openApiService.fetchDoorGroupsWithDetails();
    }

    public Map<String, Object> saveDoorGroup(Long id, String name, String memo, String orgCode,
                                             List<String> channelCodes) {
        if (!StringUtils.hasText(name)) {
            throw new IllegalArgumentException("门组名称不能为空");
        }
        List<Map<String, Object>> details = new ArrayList<>();
        Map<String, String> nameByCode = new HashMap<>();
        for (Map<String, Object> ch : channelMapper.listDoorChannelsLite()) {
            nameByCode.put(String.valueOf(ch.get("channelCode")), String.valueOf(ch.get("channelName")));
        }
        if (channelCodes != null) {
            for (String code : channelCodes) {
                if (!StringUtils.hasText(code)) continue;
                String c = code.trim();
                Map<String, Object> d = new HashMap<>();
                d.put("channelCode", c);
                d.put("channelName", nameByCode.getOrDefault(c, ""));
                details.add(d);
            }
        }
        Map<String, Object> body = new LinkedHashMap<>();
        if (id != null) {
            body.put("id", id);
            body.put("addDoorGroupRelDoorList", new ArrayList<>());
            body.put("deleteDoorGroupRelDoorList", new ArrayList<>());
        }
        body.put("name", name.trim());
        body.put("memo", memo == null ? "" : memo);
        body.put("orgCode", orgCode == null ? "" : orgCode);
        body.put("doorGroupDetail", details);
        return id == null ? openApiService.addDoorGroup(body) : openApiService.updateDoorGroup(body);
    }

    public Map<String, Object> deleteDoorGroup(long id) {
        return openApiService.deleteDoorGroups(List.of(id));
    }

    public List<Map<String, Object>> listOrgs() {
        Map<String, Object> resp = openApiService.fetchDeviceOrgTree();
        List<Map<String, Object>> out = new ArrayList<>();
        Map<String, Object> data = DahuaOpenApiService.asMap(resp.get("data"));
        for (Map<String, Object> org : DahuaOpenApiService.asListOfMap(data.get("organizations"))) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("code", org.get("code"));
            row.put("name", org.get("name"));
            row.put("parentCode", org.get("parentCode"));
            out.add(row);
        }
        return out;
    }

    public List<Map<String, Object>> listDepartments() {
        List<Map<String, Object>> out = new ArrayList<>();
        departmentMapper.listAll().forEach(d -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", d.getId());
            row.put("parentId", d.getParentId());
            row.put("name", d.getName());
            row.put("sort", d.getSort());
            out.add(row);
        });
        return out;
    }

    /** 按人授权列表：带卡号、授权状态、人员状态、部门路径等完整字段 */
    public Map<String, Object> listPersons(Long deptId, String keyword, int page, int pageSize) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("pageNum", Math.max(1, page));
        body.put("pageSize", Math.max(1, Math.min(pageSize, 200)));
        body.put("count", true);
        body.put("singleCondition", keyword == null ? "" : keyword.trim());
        if (deptId != null && deptId > 1) {
            body.put("deptIds", List.of(deptId));
        }
        body.put("status", List.of("WORKING", "FREEZE"));
        return openApiService.listPersonAuthoritiesPage(body);
    }

    /** 新增人员；工号缺省时自动生成（yyyyMMdd+人员id），可选连带录卡 */
    public Map<String, Object> createPerson(String name, String code, Long departmentId,
                                            String phone, String email, Integer sex, String birthday,
                                            Integer paperType, String paperNumber, String cardNumber) {
        String n = name == null ? "" : name.trim();
        String c = code == null ? "" : code.trim();
        if (n.isEmpty()) throw new IllegalArgumentException("姓名不能为空");
        if (c.length() > 30) throw new IllegalArgumentException("人员编号不能超过 30 个字符");
        if (departmentId == null || departmentId <= 0) throw new IllegalArgumentException("请选择所属部门");
        if (sex != null && (sex < 0 || sex > 2)) throw new IllegalArgumentException("性别取值无效");

        Long personId = openApiService.generatePersonId();
        if (personId == null) throw new IllegalArgumentException("平台未返回人员ID");
        // 工号未填则沿用校园卡发卡口径：yyyyMMdd + 人员id
        if (c.isEmpty()) c = LocalDate.now().format(CODE_DATE) + personId;

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("service", "evo-thirdParty");
        body.put("id", personId);
        body.put("name", n);
        body.put("code", c);
        body.put("paperType", paperType == null ? -1 : paperType);
        body.put("paperNumber", paperNumber == null ? "" : paperNumber.trim());
        body.put("departmentId", departmentId);
        body.put("departmentList", List.of(Map.of("departmentId", departmentId, "departmentType", 1)));
        body.put("personBiosignatures", List.of());
        if (sex != null) body.put("sex", sex);
        if (StringUtils.hasText(phone)) body.put("phone", phone.trim());
        if (StringUtils.hasText(email)) body.put("email", email.trim());
        if (StringUtils.hasText(birthday)) body.put("birthday", birthday.trim());

        Map<String, Object> resp = openApiService.addPerson(body);
        if (!openApiService.isSuccess(resp)) {
            throw new IllegalArgumentException("新增人员失败：" + errMsg(resp));
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", personId);
        out.put("code", c);
        out.put("upstream", resp);
        if (StringUtils.hasText(cardNumber)) {
            try {
                out.put("card", addCardForPerson(cardNumber.trim(), personId, departmentId));
            } catch (RuntimeException ex) {
                // 录卡失败时把刚建的人员一起清掉，避免平台上留下没有卡片的半成品
                removePersonQuietly(personId, departmentId);
                throw ex;
            }
        }
        return out;
    }

    private void removePersonQuietly(Long personId, Long departmentId) {
        try {
            Map<String, Object> del = new LinkedHashMap<>();
            del.put("openDeleteFlag", 1);
            del.put("ids", List.of(personId));
            del.put("deleteCardFlag", 1);
            del.put("departmentId", String.valueOf(departmentId));
            openApiService.deletePersons(del);
            Map<String, Object> purge = new LinkedHashMap<>();
            purge.put("ids", List.of(personId));
            openApiService.purgePersons(purge);
        } catch (Exception ignore) {
            // 回滚失败不覆盖原始错误
        }
    }

    /** 修改人员所属部门（平台是局部更新，其他资料不受影响） */
    public Map<String, Object> updatePersonDepartment(Long personId, String name, String code, Long departmentId) {
        if (personId == null || personId <= 0) throw new IllegalArgumentException("人员ID不能为空");
        if (departmentId == null || departmentId <= 0) throw new IllegalArgumentException("请选择所属部门");
        if (!StringUtils.hasText(code)) throw new IllegalArgumentException("人员编号不能为空");
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("service", "evo-thirdParty");
        body.put("id", personId);
        body.put("code", code.trim());
        if (StringUtils.hasText(name)) body.put("name", name.trim());
        // 平台校验证件类型，必须原样带上默认值，否则报 brm.person.wrong.paper.type
        body.put("paperType", -1);
        body.put("paperNumber", "");
        body.put("departmentId", departmentId);
        body.put("departmentList", List.of(Map.of("departmentId", departmentId, "departmentType", 1)));
        Map<String, Object> resp = openApiService.updatePerson(body);
        if (!openApiService.isSuccess(resp)) {
            throw new IllegalArgumentException("修改部门失败：" + errMsg(resp));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", personId);
        out.put("departmentId", departmentId);
        return out;
    }

    /** 给已有人员补录一张卡 */
    public Map<String, Object> addPersonCard(Long personId, Long departmentId, String cardNumber) {
        if (personId == null || personId <= 0) throw new IllegalArgumentException("人员ID不能为空");
        if (departmentId == null || departmentId <= 0) throw new IllegalArgumentException("部门不能为空");
        if (!StringUtils.hasText(cardNumber)) throw new IllegalArgumentException("卡号不能为空");
        return addCardForPerson(cardNumber.trim(), personId, departmentId);
    }

    /**
     * 设为主卡。平台不会自动把旧主卡降级，必须先显式清零再设新主卡。
     */
    public Map<String, Object> setMainCard(Long personId, Long departmentId, String cardNumber,
                                           String oldMainCardNumber) {
        if (personId == null || personId <= 0) throw new IllegalArgumentException("人员ID不能为空");
        if (departmentId == null || departmentId <= 0) throw new IllegalArgumentException("部门不能为空");
        if (!StringUtils.hasText(cardNumber)) throw new IllegalArgumentException("卡号不能为空");
        String target = cardNumber.trim();
        if (StringUtils.hasText(oldMainCardNumber) && !oldMainCardNumber.trim().equalsIgnoreCase(target)) {
            Map<String, Object> resp = updateCardMainFlag(oldMainCardNumber.trim(), departmentId, 0);
            if (!openApiService.isSuccess(resp)) {
                throw new IllegalArgumentException("原主卡降级失败：" + errMsg(resp));
            }
        }
        Map<String, Object> resp = updateCardMainFlag(target, departmentId, 1);
        if (!openApiService.isSuccess(resp)) {
            throw new IllegalArgumentException("设为主卡失败：" + errMsg(resp));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cardNumber", target);
        out.put("upstream", resp);
        return out;
    }

    private Map<String, Object> updateCardMainFlag(String cardNumber, Long departmentId, int isMainCard) {
        LocalDateTime start = LocalDateTime.of(LocalDate.now(), LocalTime.MIN);
        LocalDateTime end = LocalDateTime.of(LocalDate.now().plusYears(10), LocalTime.of(23, 59, 59));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("cardNumber", cardNumber);
        body.put("cardType", "0");
        body.put("category", "0");
        body.put("departmentId", departmentId);
        body.put("startDate", DahuaOpenApiService.formatDateTime(start));
        body.put("endDate", DahuaOpenApiService.formatDateTime(end));
        body.put("isCoercion", 0);
        body.put("isMainCard", isMainCard);
        return openApiService.updateCard(body);
    }

    /** 删除一张卡：先退卡再删；主卡且还有副卡时平台会拒绝，按提示返回 */
    public Map<String, Object> deletePersonCard(String cardNumber) {
        if (!StringUtils.hasText(cardNumber)) throw new IllegalArgumentException("卡号不能为空");
        String card = cardNumber.trim();
        Map<String, Object> cardResp = openApiService.queryCardByNumber(card);
        Long cardId = null;
        if (openApiService.isSuccess(cardResp)) {
            cardId = DahuaOpenApiService.parseLong(DahuaOpenApiService.asMap(cardResp.get("data")).get("id"));
        }
        if (cardId != null) {
            openApiService.returnCardById(cardId);
        }
        Map<String, Object> delResp = openApiService.deleteCardByNumber(card);
        Map<String, Object> data = DahuaOpenApiService.asMap(delResp.get("data"));
        boolean ok = openApiService.isSuccess(delResp)
                && DahuaOpenApiService.parseInt(data.get("successNum"), 0) > 0;
        if (!ok) {
            String code = String.valueOf(delResp.getOrDefault("code", ""));
            if ("28140014".equals(code)) {
                throw new IllegalArgumentException("该卡是主卡且此人还有其他卡，平台不允许删除；请先设为其他卡为主卡再删");
            }
            throw new IllegalArgumentException("删卡失败：" + errMsg(delResp));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cardNumber", card);
        return out;
    }

    /** 给刚建的人录一张卡（category 0 介质、10 年有效期），随后激活；已激活的重复激活会被平台当作成功跳过 */
    private Map<String, Object> addCardForPerson(String cardNumber, Long personId, Long departmentId) {
        Long cardId = openApiService.generateCardId();
        if (cardId == null) throw new IllegalArgumentException("平台未返回卡片ID");

        LocalDateTime start = LocalDateTime.of(LocalDate.now(), LocalTime.MIN);
        LocalDateTime end = LocalDateTime.of(LocalDate.now().plusYears(10), LocalTime.of(23, 59, 59));

        Map<String, Object> addBody = new LinkedHashMap<>();
        addBody.put("id", cardId);
        addBody.put("cardNumber", cardNumber);
        addBody.put("category", "0");
        addBody.put("cardType", "0");
        addBody.put("startDate", DahuaOpenApiService.formatDateTime(start));
        addBody.put("endDate", DahuaOpenApiService.formatDateTime(end));
        addBody.put("personId", personId);
        addBody.put("departmentId", departmentId);
        addBody.put("availableTimes", null);
        Map<String, Object> addResp = openApiService.addCard(addBody);
        if (!openApiService.isSuccess(addResp)) {
            throw new IllegalArgumentException("卡片录入失败：" + errMsg(addResp));
        }

        Map<String, Object> actBody = new LinkedHashMap<>();
        actBody.put("id", cardId);
        actBody.put("cardNumber", cardNumber);
        actBody.put("personId", personId);
        actBody.put("departmentId", departmentId);
        actBody.put("cardPassword", null);
        actBody.put("passwordKey", null);
        actBody.put("startDate", DahuaOpenApiService.formatDateTime(start));
        actBody.put("endDate", DahuaOpenApiService.formatDateTime(end));
        actBody.put("availableTimes", null);
        actBody.put("category", "0");
        Map<String, Object> actResp = openApiService.activateCard(actBody);
        // 平台在 card/add 后往往已是激活态，再调激活返回 28140006，按成功处理
        if (!openApiService.isSuccess(actResp) && !isAlreadyActive(actResp)) {
            throw new IllegalArgumentException("卡片激活失败：" + errMsg(actResp));
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", cardId);
        out.put("cardNumber", cardNumber);
        out.put("upstream", addResp);
        return out;
    }

    /** 平台在 add 后已是激活态时，重复激活返回 28140006 */
    private static boolean isAlreadyActive(Map<String, Object> resp) {
        if (resp == null) return false;
        String code = String.valueOf(resp.getOrDefault("code", ""));
        String msg = errMsg(resp).toLowerCase();
        return "28140006".equals(code)
                || (msg.contains("status") && msg.contains("not support"))
                || (msg.contains("already") && msg.contains("activ"));
    }

    private static String errMsg(Map<String, Object> resp) {        if (resp == null) return "上游无响应";
        Object msg = resp.get("errMsg");
        if (msg == null) msg = resp.get("message");
        String s = msg == null ? "" : String.valueOf(msg).trim();
        return s.isEmpty() ? "上游返回失败" : s;
    }

    /** 删除人员（软删）；deleteCard=true 时连带删除卡片 */
    public Map<String, Object> deletePersons(List<Long> ids, boolean deleteCard, String departmentId) {
        if (ids == null || ids.isEmpty()) throw new IllegalArgumentException("请至少选择一名人员");
        if (ids.size() > 200) throw new IllegalArgumentException("单次最多删除 200 人");
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("openDeleteFlag", 1);
        body.put("ids", ids);
        body.put("deleteCardFlag", deleteCard ? 1 : 0);
        body.put("departmentId", departmentId == null ? "" : departmentId);
        return openApiService.deletePersons(body);
    }

    /** 已删除人员（回收站）；statusList=0 是平台的“删除”状态 */
    public Map<String, Object> listDeletedPersons(Long deptId, String keyword, int page, int pageSize) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("pageNum", Math.max(1, page));
        body.put("pageSize", Math.max(1, Math.min(pageSize, 200)));
        body.put("searchKey", keyword == null ? "" : keyword.trim());
        body.put("statusList", List.of(0));
        if (deptId != null && deptId > 1) {
            body.put("departmentId", deptId);
        }
        return openApiService.listPersonPage(body);
    }

    public Map<String, Object> restorePersons(List<Long> ids) {
        if (ids == null || ids.isEmpty()) throw new IllegalArgumentException("请至少选择一名人员");
        if (ids.size() > 200) throw new IllegalArgumentException("单次最多操作 200 人");
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ids", ids);
        return openApiService.rollbackPersons(body);
    }

    public Map<String, Object> purgePersons(List<Long> ids) {
        if (ids == null || ids.isEmpty()) throw new IllegalArgumentException("请至少选择一名人员");
        if (ids.size() > 200) throw new IllegalArgumentException("单次最多操作 200 人");
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ids", ids);
        return openApiService.purgePersons(body);
    }

    /** 修改单个通道名称（门禁 / 视频通用） */
    public Map<String, Object> renameChannel(String channelCode, String channelName) {
        String code = channelCode == null ? "" : channelCode.trim();
        String name = channelName == null ? "" : channelName.trim();
        if (code.isEmpty()) throw new IllegalArgumentException("通道编码不能为空");
        if (name.isEmpty()) throw new IllegalArgumentException("通道名称不能为空");
        if (name.length() > 60) throw new IllegalArgumentException("通道名称不能超过 60 个字符");
        // 平台名称规则不含 ?；出现 ? 通常是调用方编码丢失，直接拦下避免写坏名称
        if (name.indexOf('?') >= 0) throw new IllegalArgumentException("通道名称包含无效字符（?），请检查请求编码");
        DahuaDeviceChannelCache channel = channelMapper.findByChannelCode(code);
        if (channel == null) throw new IllegalArgumentException("本地通道缓存不存在，请先同步大华通道");
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("channelName", name);
        body.put("channelCode", code);
        body.put("ownerCode", channel.getOwnerCode() == null ? "" : channel.getOwnerCode());
        Map<String, Object> resp = openApiService.updateChannelInfo(body);
        if (openApiService.isSuccess(resp)) {
            channelMapper.updateChannelName(code, name);
        }
        return resp;
    }

    /** 批量改名：逐个调用平台专用通道接口，返回成功数与失败明细 */
    public Map<String, Object> batchRenameChannels(List<Map<String, String>> items) {
        int success = 0;
        List<Map<String, Object>> failures = new ArrayList<>();
        for (Map<String, String> item : items) {
            String code = item.get("channelCode");
            String name = item.get("channelName");
            try {
                Map<String, Object> resp = renameChannel(code, name);
                if (openApiService.isSuccess(resp)) {
                    success++;
                } else {
                    failures.add(failure(code, resp));
                }
            } catch (Exception e) {
                failures.add(failure(code, e.getMessage()));
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("successCount", success);
        out.put("failedCount", failures.size());
        out.put("failures", failures);
        return out;
    }

    private static Map<String, Object> failure(String code, Object message) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("channelCode", code);
        row.put("message", message == null ? "改名失败" : String.valueOf(message));
        return row;
    }

    public Map<String, Object> personAuthorities(String personCode) {
        if (!StringUtils.hasText(personCode)) {
            throw new IllegalArgumentException("人员编码不能为空");
        }
        return openApiService.fetchPersonAuthorities(personCode.trim());
    }

    public Map<String, Object> authorize(String personCode, List<String> channelCodes,
                                         List<Long> doorGroupIds, String startDate, String endDate) {
        if (!StringUtils.hasText(personCode)) {
            throw new IllegalArgumentException("人员编码不能为空");
        }
        List<Map<String, Object>> details = buildDetails(channelCodes, doorGroupIds);
        if (details.isEmpty()) {
            throw new IllegalArgumentException("请至少选择一个门禁或门组");
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("personCodes", List.of(personCode.trim()));
        body.put("timeQuantumId", "1");
        body.put("privilegeDetails", details);
        if (StringUtils.hasText(startDate)) body.put("startDate", startDate);
        if (StringUtils.hasText(endDate)) body.put("endDate", endDate);
        return openApiService.batchAuthority(body);
    }

    public Map<String, Object> revoke(String personCode, List<String> channelCodes, List<Long> doorGroupIds) {
        if (!StringUtils.hasText(personCode)) {
            throw new IllegalArgumentException("人员编码不能为空");
        }
        List<Map<String, Object>> details = new ArrayList<>();
        if (channelCodes != null) {
            for (String code : channelCodes) {
                if (!StringUtils.hasText(code)) continue;
                Map<String, Object> d = new LinkedHashMap<>();
                d.put("privilegeType", 1);
                d.put("resourceCode", code.trim());
                details.add(d);
            }
        }
        if (doorGroupIds != null) {
            for (Long id : doorGroupIds) {
                if (id == null) continue;
                Map<String, Object> d = new LinkedHashMap<>();
                d.put("privilegeType", 2);
                d.put("resourceCode", id);
                details.add(d);
            }
        }
        if (details.isEmpty()) {
            throw new IllegalArgumentException("请至少选择一个要回收的权限");
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("personCode", personCode.trim());
        body.put("deleteDetails", details);
        return openApiService.deleteSinglePrivilege(body);
    }

    private List<Map<String, Object>> buildDetails(List<String> channelCodes, List<Long> doorGroupIds) {
        List<Map<String, Object>> details = new ArrayList<>();
        if (channelCodes != null) {
            for (String code : channelCodes) {
                if (!StringUtils.hasText(code)) continue;
                Map<String, Object> d = new LinkedHashMap<>();
                d.put("privilegeType", 1);
                d.put("resourceCode", code.trim());
                d.put("timeQuantumId", "1");
                details.add(d);
            }
        }
        if (doorGroupIds != null) {
            for (Long id : doorGroupIds) {
                if (id == null) continue;
                Map<String, Object> d = new LinkedHashMap<>();
                d.put("privilegeType", 2);
                d.put("resourceCode", id);
                d.put("timeQuantumId", "1");
                details.add(d);
            }
        }
        return details;
    }
}
