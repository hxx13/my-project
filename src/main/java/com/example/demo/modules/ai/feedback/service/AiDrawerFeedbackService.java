package com.example.demo.modules.ai.feedback.service;

import com.example.demo.modules.ai.feedback.entity.AiDrawerFeedback;
import com.example.demo.modules.ai.feedback.mapper.AiDrawerFeedbackMapper;
import com.example.demo.modules.ai.timer.service.AiTimerService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * AI 抽屉反馈的读写：提交（人人可）、按范围列表、回复改状态（仅 ≥超管）。
 *
 * <p>三条口径：
 * <ol>
 *   <li><b>提交校验在落库之前一次做完</b>：文字必填、图片是数组且不超过 {@value #MAX_IMAGES} 张、
 *       每张要是**本站上传返回的地址**。任一条不合法就抛，**一个字节都不写**（不做部分成功）。</li>
 *   <li><b>「看全部」是后门，不是默认。</b>{@code allScope} 只有 ≥超管能用；普通账号传 true **直接拒**，
 *       不回落到「只看自己的」—— 静默降级会让人以为「别人没提过反馈」（口径同 {@link AiTimerService#list}）。</li>
 *   <li><b>回复是「回复串」</b>：带内容 → **追加**一条到 {@code replies_json}（带可选回复附图，
 *       状态缺省 REPLIED），并把旧单回复列更新成这条（兼容尚未更新的消费方）；
 *       不带内容且 status=PENDING → 撤回（回复串与旧三列一并清空、状态回 PENDING）；
 *       不带内容却要标 REPLIED、或 status 是别的值 → 一律拒。权限判据复用 {@link AiTimerService#isSuper}，不另写一套。</li>
 * </ol>
 */
@Service
public class AiDrawerFeedbackService {

    private static final Logger log = LoggerFactory.getLogger(AiDrawerFeedbackService.class);

    /** 一次最多带几张图。 */
    public static final int MAX_IMAGES = 6;
    /** 文字与回复的长度上限（列是 TEXT，这里给个防滥用的帽子）。 */
    public static final int TEXT_MAX = 2000;
    /** 单页最多多少条。 */
    public static final int PAGE_MAX = 100;
    /** 本站上传地址的特征片段（见 {@code UploadFileStorageService#store}）。 */
    private static final String UPLOAD_MARKER = "/api/upload/files/";
    private static final Set<String> ALLOWED_STATUSES =
            Set.of(AiDrawerFeedback.STATUS_PENDING, AiDrawerFeedback.STATUS_REPLIED);
    /** 回复串里时间戳的落地形状（与接口返回旧列同形，便于前端直接显示）。 */
    private static final DateTimeFormatter REPLY_TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /**
     * 单条回复的内存形状，也是 {@code replies_json} 数组元素的形状。
     * {@code repliedByName} 是**落库时的作者名快照**（与提交侧 {@code user_name} 同一口径）；
     * 读取时若能用通用解析件解析到实时名字，则以实时名字为准，快照只在解析不到时兜底。
     */
    public record Reply(String content, List<String> imageUrls, String repliedBy, String repliedAt,
                        String repliedByName) {
    }

    private final AiDrawerFeedbackMapper mapper;
    private final UserDisplayNameService displayNameService;
    private final ObjectMapper objectMapper;

    public AiDrawerFeedbackService(AiDrawerFeedbackMapper mapper,
                                   UserDisplayNameService displayNameService,
                                   ObjectMapper objectMapper) {
        this.mapper = mapper;
        this.displayNameService = displayNameService;
        this.objectMapper = objectMapper;
    }

    /** 一页反馈：行 + 总数 + 分页参数 + 本次是不是「看全部」。 */
    public record Page(List<AiDrawerFeedback> rows, int total, int page, int size, boolean allScope) {
    }

    // ── 提交 ──

    /**
     * 提交一条反馈。{@code rawImageUrls} 是请求体里那个字段的原值 —— 故意收 {@code Object}
     * 而不是 {@code List<String>}：JSON 里的数字/对象会被直接反序列化成对应类型，
     * 在这里显式判「是不是字符串」才能把「非字符串地址」挡在外面，而不是被静默转成字符串。
     *
     * @return 落库后的这条（带生成的 id）
     */
    public AiDrawerFeedback submit(User actor, String content, Object rawImageUrls) {
        if (actor == null) {
            throw new IllegalStateException("未识别到提交人");
        }
        String text = content == null ? "" : content.strip();
        if (text.isEmpty()) {
            throw new IllegalArgumentException("反馈内容不能为空");
        }
        if (text.length() > TEXT_MAX) {
            throw new IllegalArgumentException("反馈内容太长（上限 " + TEXT_MAX + " 字）");
        }
        List<String> images = normalizeImageUrls(rawImageUrls);

        AiDrawerFeedback row = new AiDrawerFeedback();
        row.setUserId(actor.getId());
        row.setUserName(actorName(actor));
        row.setContent(text);
        row.setImageUrls(writeImages(images));
        row.setStatus(AiDrawerFeedback.STATUS_PENDING);
        mapper.insert(row);
        log.info("[ai-drawer-feedback] 提交 id={} by={} images={}", row.getId(), actor.getId(), images.size());
        return row;
    }

    /** 校验并规整图片地址：可为空、最多 6 张、每张必须是像本站上传返回的地址。 */
    private List<String> normalizeImageUrls(Object raw) {
        if (raw == null) {
            return List.of();
        }
        if (!(raw instanceof List<?> list)) {
            throw new IllegalArgumentException("图片地址要传数组");
        }
        if (list.size() > MAX_IMAGES) {
            throw new IllegalArgumentException("最多只能带 " + MAX_IMAGES + " 张图");
        }
        List<String> out = new ArrayList<>(list.size());
        for (Object one : list) {
            if (!(one instanceof String s)) {
                throw new IllegalArgumentException("图片地址必须是字符串");
            }
            out.add(checkImageUrl(s));
        }
        return out;
    }

    /**
     * 一张图必须是本站上传返回的地址。
     *
     * <p>ponytail: 只按「含 {@code /api/upload/files/} 且不含 {@code ..}」判定 —— 足以挡住任意外链与
     * 目录穿越，又不依赖 host 白名单（本地 public-base-url 为空时地址是相对路径，没有 host 可对）。
     * 若将来要连第三方图床，再在这里加 host 白名单。
     */
    private static String checkImageUrl(String url) {
        String u = url == null ? "" : url.strip();
        if (u.isEmpty()) {
            throw new IllegalArgumentException("图片地址不能为空");
        }
        if (u.contains("..")) {
            throw new IllegalArgumentException("图片地址不合法");
        }
        if (!u.contains(UPLOAD_MARKER)) {
            throw new IllegalArgumentException("图片地址不是本站上传的地址：" + u);
        }
        return u;
    }

    private String writeImages(List<String> images) {
        if (images.isEmpty()) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(images);
        } catch (Exception e) {
            throw new IllegalArgumentException("图片地址格式不正确");
        }
    }

    // ── 列表 ──

    /**
     * 列表。
     *
     * @param allScope ≥SUPER_ADMIN 才允许 true（看全部人的）；普通账号传 true **直接拒**，
     *                 **不回落到「只看自己的」**——静默降级会让人以为别人没提过反馈
     */
    public Page list(User actor, boolean allScope, int page, int size) {
        if (actor == null) {
            throw new IllegalStateException("未识别到操作人");
        }
        if (allScope && !AiTimerService.isSuper(actor)) {
            throw new IllegalStateException("只有超级管理员及以上能查看全部反馈");
        }
        int safeSize = Math.min(Math.max(size, 1), PAGE_MAX);
        int safePage = Math.max(page, 0);
        int offset = safePage * safeSize;
        if (allScope) {
            return new Page(mapper.selectAll(offset, safeSize), mapper.countAll(), safePage, safeSize, true);
        }
        return new Page(mapper.selectByUser(actor.getId(), offset, safeSize),
                mapper.countByUser(actor.getId()), safePage, safeSize, false);
    }

    // ── 回复 / 改状态 ──

    /**
     * 回复 / 改状态（**仅 ≥超管**）。四条语义：
     * <ol>
     *   <li>回复内容非空 → **追加一条**到 {@code replies_json}（可带回复附图），状态按传入值（**未传则 REPLIED**），
     *       同时把旧单回复三列更新成这条（兼容读）；</li>
     *   <li>回复内容为空/空白 且 {@code status=PENDING} → **撤回**：回复串与旧三列一并清空、状态置 PENDING；</li>
     *   <li>回复内容为空/空白 且 {@code status=REPLIED} → **拒**（标记已回复必须写回复内容）；</li>
     *   <li>其它 {@code status} 取值（含空串/空白）→ 拒，不放宽。</li>
     * </ol>
     * 顺序：判权限 → 判 id → 校验状态 → 校验回复附图（同上限/同本站判据） → 分「追加 / 撤回」两路各走一次 UPDATE。
     *
     * <p>ponytail: 追加走「读整行 → 在内存里拼一条 → 整行写回」的读-改-写。并发回复同一行会丢后写
     * （管理员单人操作场景够用）。要并发安全就换子表（一条回复一行）。
     */
    public AiDrawerFeedback reply(User actor, Long id, String replyContent, String status, Object rawReplyImageUrls) {
        if (actor == null) {
            throw new IllegalStateException("未识别到操作人");
        }
        if (!AiTimerService.isSuper(actor)) {
            throw new IllegalStateException("只有超级管理员及以上能回复反馈");
        }
        if (id == null) {
            throw new IllegalArgumentException("缺少要回复的反馈 id");
        }
        // status 缺省（未传）视为 REPLIED；传了但非法（含空串/空白）一律拒
        String normalizedStatus = status == null
                ? AiDrawerFeedback.STATUS_REPLIED
                : status.strip().toUpperCase();
        if (!ALLOWED_STATUSES.contains(normalizedStatus)) {
            throw new IllegalArgumentException("状态只能是 PENDING 或 REPLIED");
        }
        // 回复附图与提交侧同一套校验（每张是字符串、本站地址、≤6 张）；不合规整单拒、不部分写入
        List<String> replyImages = normalizeImageUrls(rawReplyImageUrls);
        String text = replyContent == null ? "" : replyContent.strip();
        if (text.isEmpty()) {
            // 空回复只有「撤回（PENDING）」一条路；标已回复却不给内容 → 拒
            if (!AiDrawerFeedback.STATUS_PENDING.equals(normalizedStatus)) {
                throw new IllegalArgumentException("标记已回复必须写回复内容");
            }
            // 撤回：回复串与旧三列一并清空
            if (mapper.reply(id, null, null, null, null, null, AiDrawerFeedback.STATUS_PENDING) != 1) {
                throw new IllegalStateException("这条反馈刚刚已不存在，刷新看一下");
            }
            return mapper.selectById(id);
        }
        if (text.length() > TEXT_MAX) {
            throw new IllegalArgumentException("回复内容太长（上限 " + TEXT_MAX + " 字）");
        }
        AiDrawerFeedback row = mapper.selectById(id);
        if (row == null) {
            throw new IllegalStateException("没有这条反馈（可能已被删除）");
        }
        // 追加：读旧的回复串 → 拼一条 → 整串写回；同一条的时间戳也落进旧列，两条口径一致
        List<Reply> replies = parseReplies(row.getRepliesJson());
        LocalDateTime now = LocalDateTime.now();
        replies.add(new Reply(text, List.copyOf(replyImages), actor.getId(), now.format(REPLY_TS), actorName(actor)));
        if (mapper.reply(id, text, writeImages(replyImages), actor.getId(), now,
                writeReplies(replies), normalizedStatus) != 1) {
            throw new IllegalStateException("这条反馈刚刚已不存在，刷新看一下");
        }
        return mapper.selectById(id);
    }

    /** 把 {@code replies_json} 解析成回复列表（升序，落库时就是按追加顺序存的）；脏数据给空表，绝不抛。 */
    public List<Reply> parseReplies(String json) {
        if (json == null || json.isBlank()) {
            return new ArrayList<>();
        }
        try {
            return objectMapper.readValue(json, objectMapper.getTypeFactory()
                    .constructCollectionType(List.class, Reply.class));
        } catch (Exception e) {
            log.debug("[ai-drawer-feedback] 回复串解析失败，按空处理: {}", e.getMessage());
            return new ArrayList<>();
        }
    }

    private String writeReplies(List<Reply> replies) {
        try {
            return objectMapper.writeValueAsString(replies);
        } catch (Exception e) {
            throw new IllegalArgumentException("回复格式不正确");
        }
    }

    // ── 读取侧：作者展示名 ──

    /**
     * 给一页反馈里的**回复作者**与**提交人**做一次性批量取名。
     *
     * <p>把整页所有回复作者 id（外加 userName 为空那几行的提交人 id）去掉空值、去重后，
     * 只调**一次** {@link UserDisplayNameService#resolveDisplayNames}，绝不逐条查。
     * 返回 id → 展示名；通用件查不到时自己回落成 id 本身（据此判断「没解析到」）。
     */
    public Map<String, String> resolvePageNames(List<AiDrawerFeedback> rows) {
        Set<String> ids = new LinkedHashSet<>();
        if (rows != null) {
            for (AiDrawerFeedback f : rows) {
                if (f == null) {
                    continue;
                }
                if (f.getUserName() == null || f.getUserName().isBlank()) {
                    addIfPresent(ids, f.getUserId());
                }
                for (Reply r : parseReplies(f.getRepliesJson())) {
                    if (r != null) {
                        addIfPresent(ids, r.repliedBy());
                    }
                }
            }
        }
        return ids.isEmpty() ? Map.of() : displayNameService.resolveDisplayNames(ids);
    }

    /**
     * 把一条回复补成对外展示形状：作者名按「批量解析名 → 落库时的快照 → id」取值。
     * 解析名等于 id 视为「没解析到」，继续回落（{@code UserDisplayNameService} 查不到就是回落 id）。
     */
    public Reply viewReply(Reply r, Map<String, String> names) {
        String by = r.repliedBy();
        String resolved = (by != null && names != null) ? names.get(by) : null;
        String name;
        if (resolved != null && !resolved.isBlank() && !resolved.equals(by)) {
            name = resolved;
        } else if (r.repliedByName() != null && !r.repliedByName().isBlank()) {
            name = r.repliedByName();
        } else {
            name = by;
        }
        return new Reply(r.content(), r.imageUrls(), by, r.repliedAt(), name);
    }

    private static void addIfPresent(Set<String> ids, String id) {
        if (id != null && !id.isBlank()) {
            ids.add(id.trim());
        }
    }

    /** 姓名快照：优先统一人员表的显示名，取不到再回落昵称 / 账号名（同 {@code AiTimerService#ownerName}）。 */
    private String actorName(User actor) {
        try {
            String name = displayNameService.resolveDisplayName(actor.getId());
            if (name != null && !name.isBlank()) {
                return name;
            }
        } catch (RuntimeException e) {
            log.debug("[ai-drawer-feedback] 取显示名失败，回落昵称: {}", e.getMessage());
        }
        if (actor.getDisplayNickname() != null && !actor.getDisplayNickname().isBlank()) {
            return actor.getDisplayNickname();
        }
        return actor.getUsername();
    }
}
