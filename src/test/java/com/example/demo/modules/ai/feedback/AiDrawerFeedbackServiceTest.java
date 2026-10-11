package com.example.demo.modules.ai.feedback;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.feedback.entity.AiDrawerFeedback;
import com.example.demo.modules.ai.feedback.mapper.AiDrawerFeedbackMapper;
import com.example.demo.modules.ai.feedback.service.AiDrawerFeedbackService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * {@link AiDrawerFeedbackService} 的六类契约（假 Mapper，不连 Spring 上下文）：
 * ① 空文字 / >6 图 / 非字符串 / 非本站地址 都被拒且不写库；
 * ② 普通账号能提交、能看自己的、看不到别人的；
 * ③ 普通账号请求「全部」被拒（不静默回落）；
 * ④ 普通账号回复被拒；
 * ⑤ 超管能看全部、能回复、能改 REPLIED，且 replied_by/replied_at 落上；
 * ⑥ 非法状态值被拒；
 * ⑦ 回复语义：非空回复缺省状态默认 REPLIED；空/空白 + PENDING 撤回清空；空/空白 + REPLIED（或缺省）被拒；
 * ⑧ 回复串：连回两次逐条累积（顺序按时间、旧单回复列=最后一条）；撤回后回复串也清空。
 */
class AiDrawerFeedbackServiceTest {

    /** 内存假 Mapper：id 自增，列表按 id 倒序（≈提交时间倒序），分页在内存里切。 */
    private static final class FakeMapper implements AiDrawerFeedbackMapper {
        final Map<Long, AiDrawerFeedback> rows = new LinkedHashMap<>();
        private long seq = 0;

        @Override
        public int insert(AiDrawerFeedback row) {
            row.setId(++seq);
            if (row.getCreatedAt() == null) {
                row.setCreatedAt(LocalDateTime.now());
            }
            rows.put(row.getId(), row);
            return 1;
        }

        @Override
        public AiDrawerFeedback selectById(Long id) {
            return id == null ? null : rows.get(id);
        }

        @Override
        public List<AiDrawerFeedback> selectByUser(String userId, int offset, int limit) {
            List<AiDrawerFeedback> mine = sorted().stream()
                    .filter(r -> userId.equals(r.getUserId()))
                    .toList();
            return page(mine, offset, limit);
        }

        @Override
        public int countByUser(String userId) {
            return (int) rows.values().stream().filter(r -> userId.equals(r.getUserId())).count();
        }

        @Override
        public List<AiDrawerFeedback> selectAll(int offset, int limit) {
            return page(sorted(), offset, limit);
        }

        @Override
        public int countAll() {
            return rows.size();
        }

        @Override
        public int reply(Long id, String replyContent, String replyImageUrls, String repliedBy,
                         LocalDateTime repliedAt, String repliesJson, String status) {
            AiDrawerFeedback row = rows.get(id);
            if (row == null) {
                return 0;
            }
            row.setReplyContent(replyContent);
            row.setReplyImageUrls(replyImageUrls);
            row.setRepliedBy(repliedBy);
            row.setRepliedAt(repliedAt);
            row.setRepliesJson(repliesJson);
            row.setStatus(status);
            return 1;
        }

        private List<AiDrawerFeedback> sorted() {
            List<AiDrawerFeedback> out = new ArrayList<>(rows.values());
            out.sort(Comparator.comparingLong(AiDrawerFeedback::getId).reversed());
            return out;
        }

        private static List<AiDrawerFeedback> page(List<AiDrawerFeedback> all, int offset, int limit) {
            if (offset >= all.size()) {
                return List.of();
            }
            int end = Math.min(offset + limit, all.size());
            return new ArrayList<>(all.subList(offset, end));
        }
    }

    private static final String OK_IMG = "/api/upload/files/20260416/abc.png";

    /**
     * 假解析件：{@code resolveDisplayName}（写侧快照）返回「快照-<id>」；
     * {@code resolveDisplayNames}（读侧批量）返回可设定的 {@link #batchResult}，并数调用次数。
     */
    private static final class CountingNames extends UserDisplayNameService {
        int batchCalls = 0;
        Map<String, String> batchResult = Map.of();

        CountingNames() {
            super(null, null, null, null);
        }

        @Override
        public String resolveDisplayName(String userId) {
            return "快照-" + userId;
        }

        @Override
        public Map<String, String> resolveDisplayNames(java.util.Collection<String> userIds) {
            batchCalls += 1;
            return batchResult;
        }
    }

    private static AiDrawerFeedbackService service(FakeMapper mapper) {
        // 姓名解析只用到 resolveDisplayName，其它依赖传 null（构造器只赋值、不碰它们）
        return new AiDrawerFeedbackService(mapper, new CountingNames(), new ObjectMapper());
    }

    private static AiDrawerFeedbackService service(FakeMapper mapper, CountingNames names) {
        return new AiDrawerFeedbackService(mapper, names, new ObjectMapper());
    }

    private static User user(String id, RoleEnum role) {
        User u = new User();
        u.setId(id);
        u.setRole(role);
        return u;
    }

    // ① 校验类：都不许写库
    @Test
    void 空文字_超量图_非字符串_非本站地址_都被拒且不写库() {
        FakeMapper mapper = new FakeMapper();
        AiDrawerFeedbackService svc = service(mapper);
        User m = user("u1", RoleEnum.MEMBER);

        assertThrows(IllegalArgumentException.class, () -> svc.submit(m, "   ", null), "空文字应被拒");
        assertThrows(IllegalArgumentException.class, () -> svc.submit(m, null, null), "null 文字应被拒");
        assertThrows(IllegalArgumentException.class, () -> svc.submit(m, "在吗",
                List.of(OK_IMG, OK_IMG, OK_IMG, OK_IMG, OK_IMG, OK_IMG, OK_IMG)), "7 张图应被拒");
        assertThrows(IllegalArgumentException.class, () -> svc.submit(m, "在吗", List.of(1, 2)), "数字地址应被拒");
        assertThrows(IllegalArgumentException.class, () -> svc.submit(m, "在吗",
                List.of("https://evil.example/x.png")), "外链应被拒");

        assertTrue(mapper.rows.isEmpty(), "校验失败时一个字节都不许写");
    }

    // ① 补充：不是数组（给了字符串/对象）也拒
    @Test
    void 图片不是数组_被拒() {
        FakeMapper mapper = new FakeMapper();
        AiDrawerFeedbackService svc = service(mapper);
        assertThrows(IllegalArgumentException.class,
                () -> svc.submit(user("u1", RoleEnum.MEMBER), "在吗", "不是数组"));
        assertTrue(mapper.rows.isEmpty());
    }

    // ② 普通账号能提交、能看自己的；看不到别人的
    @Test
    void 普通账号_能提交_能看自己的_看不到别人的() {
        for (RoleEnum role : List.of(RoleEnum.MEMBER, RoleEnum.STAFF, RoleEnum.ADMIN)) {
            FakeMapper mapper = new FakeMapper();
            AiDrawerFeedbackService svc = service(mapper);
            User a = user("A-" + role, role);
            User b = user("B-" + role, role);

            AiDrawerFeedback saved = svc.submit(a, "我提个意见", List.of(OK_IMG));
            assertEquals(AiDrawerFeedback.STATUS_PENDING, saved.getStatus(), "默认应为 PENDING");
            assertEquals(a.getId(), saved.getUserId(), "提交人 id 应落上");
            assertEquals("快照-" + a.getId(), saved.getUserName(), "姓名快照应落上");

            svc.submit(b, "别人的意见", null);
            svc.submit(a, "我的第二条", null);

            AiDrawerFeedbackService.Page mine = svc.list(a, false, 0, 20);
            assertEquals(2, mine.total(), "只看自己的：应只有 2 条");
            assertEquals(2, mine.rows().size());
            assertTrue(mine.rows().stream().allMatch(r -> a.getId().equals(r.getUserId())), "列表不该混进别人");
            assertNotNull(mine.rows().get(0).getUserId());
            // 倒序：最后提交的「我的第二条」在前
            assertEquals("我的第二条", mine.rows().get(0).getContent());
        }
    }

    // ③ 普通账号请求「全部」→ 明确拒，不是静默回落
    @Test
    void 普通账号_请求全部_被拒() {
        for (RoleEnum role : List.of(RoleEnum.MEMBER, RoleEnum.STAFF, RoleEnum.ADMIN)) {
            FakeMapper mapper = new FakeMapper();
            AiDrawerFeedbackService svc = service(mapper);
            User a = user("A-" + role, role);
            svc.submit(a, "只有我一条", null);

            assertThrows(IllegalStateException.class, () -> svc.list(a, true, 0, 20), role + " 不该能看全部");
        }
    }

    // ④ 普通账号回复 / 改状态 → 被拒
    @Test
    void 普通账号_回复被拒() {
        for (RoleEnum role : List.of(RoleEnum.MEMBER, RoleEnum.STAFF, RoleEnum.ADMIN)) {
            FakeMapper mapper = new FakeMapper();
            AiDrawerFeedbackService svc = service(mapper);
            User a = user("A-" + role, role);
            AiDrawerFeedback row = svc.submit(a, "想被回复", null);

            assertThrows(IllegalStateException.class,
                    () -> svc.reply(a, row.getId(), "自己回自己", AiDrawerFeedback.STATUS_REPLIED, null),
                    role + " 不该能回复");
            assertEquals(AiDrawerFeedback.STATUS_PENDING, mapper.selectById(row.getId()).getStatus(),
                    "被拒后状态不许变");
            assertEquals(null, mapper.selectById(row.getId()).getRepliedBy(), "被拒后不许落回复人");
        }
    }

    // ⑤ 超管能拿全部、能回复、能改 REPLIED，且 replied_by/replied_at 落上
    @Test
    void 超管_看全部_能回复_状态改REPLIED() {
        FakeMapper mapper = new FakeMapper();
        AiDrawerFeedbackService svc = service(mapper);
        User a = user("A", RoleEnum.MEMBER);
        User b = user("B", RoleEnum.MEMBER);
        AiDrawerFeedback ra = svc.submit(a, "A 的意见", null);
        svc.submit(b, "B 的意见", null);

        User sup = user("S", RoleEnum.SUPER_ADMIN);
        AiDrawerFeedbackService.Page all = svc.list(sup, true, 0, 20);
        assertEquals(2, all.total(), "超管应看到全部 2 条");
        assertEquals(2, all.rows().size());
        assertTrue(all.allScope());

        AiDrawerFeedback replied = svc.reply(sup, ra.getId(), "收到，已处理", AiDrawerFeedback.STATUS_REPLIED, null);
        assertEquals(AiDrawerFeedback.STATUS_REPLIED, replied.getStatus());
        assertEquals("收到，已处理", replied.getReplyContent());
        assertEquals("S", replied.getRepliedBy(), "replied_by 应落上超管 id");
        assertNotNull(replied.getRepliedAt(), "replied_at 应落上");

        // 更高的平台所有者同样放行
        User owner = user("O", RoleEnum.PLATFORM_OWNER);
        assertEquals(2, svc.list(owner, true, 0, 20).total());
    }

    // ⑥ 非法状态值被拒（含空、大小写外的乱值）
    @Test
    void 非法状态值_被拒() {
        FakeMapper mapper = new FakeMapper();
        AiDrawerFeedbackService svc = service(mapper);
        AiDrawerFeedback row = svc.submit(user("A", RoleEnum.MEMBER), "内容", null);
        User sup = user("S", RoleEnum.SUPER_ADMIN);

        for (String bad : List.of("DONE", "OPEN", "", "pending_", " ")) {
            assertThrows(IllegalArgumentException.class,
                    () -> svc.reply(sup, row.getId(), "回复", bad, null), "非法状态应被拒：" + bad);
        }
        assertEquals(AiDrawerFeedback.STATUS_PENDING, mapper.selectById(row.getId()).getStatus(), "被拒后状态不许变");
    }

    // ⑦ 撤回：预置一条已回复的行 → 只传 status=PENDING（回复内容空）→ 三字段清空、状态回 PENDING
    @Test
    void 空回复_切待处理_撤回清空三字段() {
        FakeMapper mapper = new FakeMapper();
        AiDrawerFeedbackService svc = service(mapper);
        User sup = user("S", RoleEnum.SUPER_ADMIN);
        AiDrawerFeedback row = svc.submit(user("A", RoleEnum.MEMBER), "想被回复", null);

        // 先正常回复一条（缺省状态应默认 REPLIED）
        AiDrawerFeedback replied = svc.reply(sup, row.getId(), "已处理", null, null);
        assertEquals(AiDrawerFeedback.STATUS_REPLIED, replied.getStatus(), "非空回复缺省状态应落 REPLIED");
        assertEquals("已处理", replied.getReplyContent());
        assertEquals("S", replied.getRepliedBy(), "replied_by 应落上");
        assertNotNull(replied.getRepliedAt(), "replied_at 应落上");

        // 空回复（null 与全空白各试一次）+ PENDING → 撤回
        for (String empty : java.util.Arrays.asList(null, "   ")) {
            AiDrawerFeedback withdrawn = svc.reply(sup, row.getId(), empty, AiDrawerFeedback.STATUS_PENDING, null);
            assertEquals(AiDrawerFeedback.STATUS_PENDING, withdrawn.getStatus(), "撤回后应为 PENDING");
            assertEquals(null, withdrawn.getReplyContent(), "reply_content 应清空");
            assertEquals(null, withdrawn.getRepliedBy(), "replied_by 应清空");
            assertEquals(null, withdrawn.getRepliedAt(), "replied_at 应清空");
            assertEquals(null, mapper.selectById(row.getId()).getReplyContent(), "库里那行也应清空");
            assertTrue(svc.parseReplies(withdrawn.getRepliesJson()).isEmpty(), "撤回后回复串应为空");
        }
    }

    // ⑧ 回复串核心：连回两次逐条累积，顺序按时间，旧单回复列等于最后一条
    @Test
    void 连回两次_回复串累积_旧列等于最后一条() {
        FakeMapper mapper = new FakeMapper();
        AiDrawerFeedbackService svc = service(mapper);
        User sup = user("S", RoleEnum.SUPER_ADMIN);
        AiDrawerFeedback row = svc.submit(user("A", RoleEnum.MEMBER), "想被回复", null);

        svc.reply(sup, row.getId(), "第一条回复", AiDrawerFeedback.STATUS_REPLIED, null);
        AiDrawerFeedback afterTwo = svc.reply(sup, row.getId(), "第二条回复", AiDrawerFeedback.STATUS_REPLIED,
                List.of(OK_IMG));

        List<AiDrawerFeedbackService.Reply> replies = svc.parseReplies(afterTwo.getRepliesJson());
        assertEquals(2, replies.size(), "两次回复应累积成两条（不再互相覆盖）");
        assertEquals("第一条回复", replies.get(0).content(), "第一条在前（按时间升序）");
        assertEquals("第二条回复", replies.get(1).content(), "第二条在后");
        assertEquals("S", replies.get(0).repliedBy(), "作者应落上");
        assertTrue(replies.get(0).repliedAt() != null && !replies.get(0).repliedAt().isBlank(), "时间应落上");
        assertEquals(List.of(OK_IMG), replies.get(1).imageUrls(), "第二条的附图应只属于第二条");
        assertTrue(replies.get(0).imageUrls().isEmpty(), "第一条没有附图");

        // 旧单回复列 = 最后一条
        assertEquals("第二条回复", afterTwo.getReplyContent(), "旧列=最后一条的内容");
        assertEquals("S", afterTwo.getRepliedBy(), "旧列=最后一条的作者");
        assertEquals("第二条回复", mapper.selectById(row.getId()).getReplyContent(), "库里那行也=最后一条");

        // 再撤一次：回复串整串清空
        AiDrawerFeedback cleared = svc.reply(sup, row.getId(), "", AiDrawerFeedback.STATUS_PENDING, null);
        assertTrue(svc.parseReplies(cleared.getRepliesJson()).isEmpty(), "撤回应清空整串");
        assertEquals(null, cleared.getReplyContent(), "撤回后旧列也清空");
    }

    // ⑦ 空回复 + REPLIED（或缺省状态，缺省=REPLIED）→ 拒，明确报错，不静默
    @Test
    void 空回复_标已回复_被拒() {
        FakeMapper mapper = new FakeMapper();
        AiDrawerFeedbackService svc = service(mapper);
        User sup = user("S", RoleEnum.SUPER_ADMIN);
        AiDrawerFeedback row = svc.submit(user("A", RoleEnum.MEMBER), "内容", null);

        assertThrows(IllegalArgumentException.class,
                () -> svc.reply(sup, row.getId(), "   ", AiDrawerFeedback.STATUS_REPLIED, null), "空回复标已回复应被拒");
        assertThrows(IllegalArgumentException.class,
                () -> svc.reply(sup, row.getId(), null, null, null), "空回复且缺省状态(=REPLIED)应被拒");
        assertEquals(AiDrawerFeedback.STATUS_PENDING, mapper.selectById(row.getId()).getStatus(), "被拒后状态不许变");
        assertEquals(null, mapper.selectById(row.getId()).getRepliedBy(), "被拒后不许落回复人");
    }

    // ⑧ 回复带图：落库并可读回（形状是 JSON 数组字符串）
    @Test
    void 回复带图_落库并可读回() throws Exception {
        FakeMapper mapper = new FakeMapper();
        AiDrawerFeedbackService svc = service(mapper);
        User sup = user("S", RoleEnum.SUPER_ADMIN);
        AiDrawerFeedback row = svc.submit(user("A", RoleEnum.MEMBER), "想被回复", null);

        List<String> replyImgs = List.of(OK_IMG, "/api/upload/files/20260416/def.jpg");
        AiDrawerFeedback replied = svc.reply(sup, row.getId(), "看下截图", AiDrawerFeedback.STATUS_REPLIED, replyImgs);

        assertEquals("看下截图", replied.getReplyContent());
        String expected = new ObjectMapper().writeValueAsString(replyImgs);
        assertEquals(expected, replied.getReplyImageUrls(), "回复附图应落成 JSON 数组串");
        assertEquals(expected, mapper.selectById(row.getId()).getReplyImageUrls(), "库里那行也应落上");
    }

    // ⑧ 回复附图校验：7 张 / 非本站地址 → 整单拒、不部分写入
    @Test
    void 回复图超量或非本站_整单拒且不写库() {
        FakeMapper mapper = new FakeMapper();
        AiDrawerFeedbackService svc = service(mapper);
        User sup = user("S", RoleEnum.SUPER_ADMIN);
        AiDrawerFeedback row = svc.submit(user("A", RoleEnum.MEMBER), "内容", null);

        List<String> seven = List.of(OK_IMG, OK_IMG, OK_IMG, OK_IMG, OK_IMG, OK_IMG, OK_IMG);
        assertThrows(IllegalArgumentException.class,
                () -> svc.reply(sup, row.getId(), "回复", AiDrawerFeedback.STATUS_REPLIED, seven), "7 张回复图应被拒");
        assertThrows(IllegalArgumentException.class,
                () -> svc.reply(sup, row.getId(), "回复", AiDrawerFeedback.STATUS_REPLIED,
                        List.of("https://evil.example/x.png")), "非本站地址应被拒");

        assertEquals(null, mapper.selectById(row.getId()).getReplyContent(), "被拒时不许落回复内容");
        assertEquals(null, mapper.selectById(row.getId()).getReplyImageUrls(), "被拒时不许落回复图");
        assertEquals(AiDrawerFeedback.STATUS_PENDING, mapper.selectById(row.getId()).getStatus(), "被拒后状态不许变");
    }

    // ⑧ 撤回：带图的回复 → 空回复 + PENDING → 回复图一并清空
    @Test
    void 撤回_清空回复附图() {
        FakeMapper mapper = new FakeMapper();
        AiDrawerFeedbackService svc = service(mapper);
        User sup = user("S", RoleEnum.SUPER_ADMIN);
        AiDrawerFeedback row = svc.submit(user("A", RoleEnum.MEMBER), "内容", null);

        svc.reply(sup, row.getId(), "已处理", AiDrawerFeedback.STATUS_REPLIED, List.of(OK_IMG));
        assertNotNull(mapper.selectById(row.getId()).getReplyImageUrls(), "先确认回复图已落上");

        AiDrawerFeedback withdrawn = svc.reply(sup, row.getId(), "   ", AiDrawerFeedback.STATUS_PENDING, null);
        assertEquals(null, withdrawn.getReplyImageUrls(), "撤回应清空回复附图");
        assertEquals(null, mapper.selectById(row.getId()).getReplyImageUrls(), "库里那行也应清空");
        assertEquals(null, withdrawn.getReplyContent(), "撤回同时清回复内容");
    }

    // ⑧ 非超管：即便带图回复仍被拒（权限判定不变）
    @Test
    void 非超管_带图回复仍被拒() {
        for (RoleEnum role : List.of(RoleEnum.MEMBER, RoleEnum.STAFF, RoleEnum.ADMIN)) {
            FakeMapper mapper = new FakeMapper();
            AiDrawerFeedbackService svc = service(mapper);
            User a = user("A-" + role, role);
            AiDrawerFeedback row = svc.submit(a, "想被回复", null);

            assertThrows(IllegalStateException.class,
                    () -> svc.reply(a, row.getId(), "自己回自己", AiDrawerFeedback.STATUS_REPLIED, List.of(OK_IMG)),
                    role + " 不该能回复（即便带图）");
            assertEquals(null, mapper.selectById(row.getId()).getReplyImageUrls(), "被拒后不许落回复图");
        }
    }

    // ⑨ 作者名展示：写侧落快照；读侧整页一次批量解析，解析不到回落快照、再回落 id
    @Test
    void 读取_回复作者名_一次批量解析_回落快照_再回落id() {
        FakeMapper mapper = new FakeMapper();
        CountingNames names = new CountingNames();
        AiDrawerFeedbackService svc = service(mapper, names);
        AiDrawerFeedback rowA = svc.submit(user("A", RoleEnum.MEMBER), "A 的意见", null);
        svc.reply(user("S1", RoleEnum.SUPER_ADMIN), rowA.getId(), "第一条", AiDrawerFeedback.STATUS_REPLIED, null);
        svc.reply(user("S1", RoleEnum.SUPER_ADMIN), rowA.getId(), "第二条", AiDrawerFeedback.STATUS_REPLIED, null);
        AiDrawerFeedback rowB = svc.submit(user("B", RoleEnum.MEMBER), "B 的意见", null);
        svc.reply(user("S2", RoleEnum.SUPER_ADMIN), rowB.getId(), "给 B 的回复", AiDrawerFeedback.STATUS_REPLIED, null);

        // 写侧：回复串里带上作者名快照
        List<AiDrawerFeedbackService.Reply> storedA =
                svc.parseReplies(mapper.selectById(rowA.getId()).getRepliesJson());
        assertEquals("快照-S1", storedA.get(0).repliedByName(), "写侧应落作者名快照");

        // 读侧：整页（两行、两个不同作者、共三条回复）只批量解析一次
        names.batchResult = Map.of("S1", "解析-S1", "S2", "解析-S2");
        List<AiDrawerFeedback> page = List.of(mapper.selectById(rowA.getId()), mapper.selectById(rowB.getId()));
        Map<String, String> resolved = svc.resolvePageNames(page);
        assertEquals(1, names.batchCalls, "整页只该调一次批量解析，不能逐条查");

        // 解析到 → 用解析名，原 id 仍在
        AiDrawerFeedbackService.Reply v0 = svc.viewReply(storedA.get(0), resolved);
        assertEquals("解析-S1", v0.repliedByName(), "解析到就用解析名");
        assertEquals("S1", v0.repliedBy(), "原 id 仍保留");

        // 解析不到（通用件回落成 id）→ 用存下的快照
        names.batchResult = Map.of("S1", "S1", "S2", "S2");
        Map<String, String> fallback = svc.resolvePageNames(page);
        assertEquals("快照-S1", svc.viewReply(storedA.get(0), fallback).repliedByName(), "解析不到应回落快照");

        // 连快照都没有（旧数据）→ 回落 id
        AiDrawerFeedbackService.Reply legacy = new AiDrawerFeedbackService.Reply(
                "旧回复", List.of(), "S1", "2026-01-01 00:00:00", null);
        assertEquals("S1", svc.viewReply(legacy, fallback).repliedByName(), "解析不到且无快照应回落 id");
    }
}
