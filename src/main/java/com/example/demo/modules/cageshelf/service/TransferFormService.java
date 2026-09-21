package com.example.demo.modules.cageshelf.service;

import com.alibaba.fastjson2.JSON;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.adminfile.OfficeToPdfConverter;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.cageshelf.dto.TransferFormData;
import com.example.demo.modules.cageshelf.dto.TransferFormRenderInput;
import com.example.demo.modules.cageshelf.entity.CageCellDetail;
import com.example.demo.modules.cageshelf.entity.CageOpRequest;
import com.example.demo.modules.cageshelf.mapper.CageCellDetailMapper;
import com.example.demo.modules.cageshelf.mapper.CageCellIndexMapper;
import com.example.demo.modules.cageshelf.mapper.CageOpRequestMapper;
import com.example.demo.modules.personnel.entity.Personnel;
import com.example.demo.modules.personnel.service.PersonnelService;
import org.apache.pdfbox.io.RandomAccessReadBuffer;
import org.apache.pdfbox.multipdf.PDFMergerUtility;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * 转移单：把一条 {@link CageOpRequest} 组装成渲染入参、渲染 PDF、终局归档、按权限读回。
 *
 * <p><b>所有「人工值优先、否则自动值」的判断都在这层的 {@link #buildInput} 里</b>，
 * {@link TransferFormRenderer} 只按行/列往模板格子里写，不做任何取值判断 —— 渲染器因此能脱离
 * 数据库单测，组装逻辑也只有一个地方要看。
 *
 * <p><b>归档只在终局发生一次</b>：请求从 pending 落到 approved / rejected 时，由
 * {@link CageOperationService} 调 {@link #archive}，文件名写进 {@code transfer_form_file_ref}。
 * 过程态（每签一次）不落盘 —— 归档是留痕，不是快照历史。文件只经
 * {@link com.example.demo.modules.cageshelf.controller.TransferFormController} 的鉴权端点出去，
 * 存储目录不当静态资源放出去（单里含课题组、AUP 与动物数据）。
 */
@Service
public class TransferFormService {

    private static final Logger log = LoggerFactory.getLogger(TransferFormService.class);

    private final CageCellDetailMapper detailMapper;
    private final CageCellIndexMapper cellIndexMapper;
    private final CageOpRequestMapper opMapper;
    private final UserMapper userMapper;
    private final UserDisplayNameService userDisplayNameService;
    private final OfficeToPdfConverter converter;
    private final CageRegionGrantService regionGrantService;
    private final CageVisibilityPolicy visibilityPolicy;
    private final CageReviewVetService reviewVetService;
    private final PersonnelService personnelService;
    private final CageInfoValueService cageInfoValueService;
    private final Path storageDir;

    public TransferFormService(CageCellDetailMapper detailMapper,
                               CageCellIndexMapper cellIndexMapper,
                               CageOpRequestMapper opMapper,
                               UserMapper userMapper,
                               UserDisplayNameService userDisplayNameService,
                               OfficeToPdfConverter converter,
                               CageRegionGrantService regionGrantService,
                               CageVisibilityPolicy visibilityPolicy,
                               CageReviewVetService reviewVetService,
                               PersonnelService personnelService,
                               CageInfoValueService cageInfoValueService,
                               @Value("${app.cage.transfer-form-dir:./data/cage-transfer-forms}") String dir) {
        this.detailMapper = detailMapper;
        this.cellIndexMapper = cellIndexMapper;
        this.opMapper = opMapper;
        this.userMapper = userMapper;
        this.userDisplayNameService = userDisplayNameService;
        this.converter = converter;
        this.regionGrantService = regionGrantService;
        this.visibilityPolicy = visibilityPolicy;
        this.reviewVetService = reviewVetService;
        this.personnelService = personnelService;
        this.cageInfoValueService = cageInfoValueService;
        this.storageDir = Path.of(dir);
    }

    // ═══════════════════════════════════════════
    // 组装
    // ═══════════════════════════════════════════

    /**
     * 组装渲染入参。人取值、位置标签、签名回填都在这里定，渲染器拿到的是成品。
     *
     * <p>取值口径：
     * <ul>
     *   <li>单位名称：学生填的优先，其次源笼位表单部门，再退课题组名，最后 detail 兜底</li>
     *   <li>负责人 / 电话：负责人取源笼位 PI（表单优先）；电话学生填的优先，否则申请人 mobile_phone</li>
     *   <li>实验人员：申请人姓名（快照为空时按 applicant_id 解析）</li>
     *   <li>转出/接收地点：位置标签，多目标按行拼</li>
     *   <li>地点负责人签字：**只有 approved 才填**（没通过的单子上不该出现签字）</li>
     *   <li>兽医复核：签过就填，没签三项都空</li>
     * </ul>
     */
    public TransferFormRenderInput buildInput(CageOpRequest req) {
        if (req == null) throw new IllegalArgumentException("转移单组装入参不能为空");
        TransferFormData data = parseForm(req.getTransferForm());
        List<CageOpPair> pairs = effectivePairs(req);
        // 表外「单位/负责人」仍是汇总字段，沿用老列指向的源（Stage B 保证 = pairs[0].source）。
        CageCellDetail src = detailMapper.selectByAnimalCageId(req.getSourceAnimalCageId());
        Map<String, Object> form = formValues(req.getSourceAnimalCageId());

        TransferFormRenderInput in = new TransferFormRenderInput();
        in.setDocNo(docNo(req));
        in.setUnitName(firstNonBlank(
                data == null ? null : data.getUnitName(),
                str(form.get("department_name")),
                str(form.get("project_name")),
                src == null ? null : firstNonBlank(src.getDepartmentName(), src.getProjectName())));
        in.setPiName(firstNonBlank(
                str(form.get("project_pi_name")),
                src == null ? null : src.getProjectPiName()));
        in.setExperimenterName(firstNonBlank(req.getApplicantName(), applicantName(req.getApplicantId())));
        in.setPhone(firstNonBlank(data == null ? null : data.getPhone(), applicantPhone(req.getApplicantId())));
        in.setTransferDate(data == null ? null : data.getTransferDate());
        Map<Long, Map<String, Object>> locById = resolveLocations(pairs);
        in.setFromLocation(pairLocations(pairs, true, locById));
        in.setToLocation(pairLocations(pairs, false, locById));
        in.setRows(buildRows(data, pairs, resolveDetails(pairs), resolveForms(pairs)));

        List<CageOpSignature> sigs = req.signatures();
        boolean approved = CageOpRequest.STATUS_APPROVED.equals(req.getStatus());
        in.setOriginReviewerName(approved ? reviewerOf(sigs, CageOpSignature.ROLE_ORIGIN) : null);
        in.setDestReviewerName(approved ? reviewerOf(sigs, CageOpSignature.ROLE_DEST) : null);
        CageOpSignature vet = signatureOf(sigs, CageOpSignature.ROLE_VET);
        in.setVetOutcome(vet == null ? null : TransferFormRenderer.outcomeLabel(vet.getDecision()));
        in.setVetReason(vet == null ? null : vet.getReason());
        in.setVetReviewerName(vet == null ? null : vet.getReviewerName());
        return in;
    }

    /**
     * 提交前的预填：拿一条**不落库**的临时请求跑同一套 {@link #buildInput}。
     *
     * <p>自动值在这里单独拼一遍必然与打印出来的单子走偏（实验人员取申请人、电话取账号、
     * 单位名称三级回退…），所以预填只走这条路 —— 弹窗里看到的就是单子上会打印的。
     *
     * <p>状态给 pending 是刻意的：还没审，签字三项自然是空的，与提交后看到的即时渲染一致。
     */
    public TransferFormRenderInput prefill(Long sourceAnimalCageId, List<Long> targetIds, String applicantId) {
        if (sourceAnimalCageId == null) throw new TwinBusinessException(400, "sourceAnimalCageId 必填");
        List<Long> targets = new ArrayList<>();
        if (targetIds != null) {
            for (Long id : targetIds) if (id != null) targets.add(id);
        }

        CageOpRequest req = new CageOpRequest();
        req.setOpType(CageOpRequest.TYPE_TRANSFER);
        req.setSourceAnimalCageId(sourceAnimalCageId);
        req.setTargetAnimalCageIds(JSON.toJSONString(targets));
        req.setApplicantId(applicantId);
        req.setStatus(CageOpRequest.STATUS_PENDING);
        return buildInput(req);
    }

    /**
     * 转移单字节流：有归档就回归档（终局单子，一次磁盘读），没有才即时渲染（待审单子）。
     *
     * <p>归档缺失 / 读不动一律退回即时渲染，不报错 —— 看单子不该因为一个文件丢了而挂掉。
     */
    public byte[] renderPdf(CageOpRequest req) {
        byte[] archived = readArchived(req);
        if (archived != null && archived.length > 0) return archived;
        return renderLive(req);
    }

    /**
     * 即时渲染（不读归档）+ 指纹缓存。
     *
     * <p>PDF 是组装入参的纯函数：soffice 每次冷启动要新建一份 profile（实测 ~3.5s），
     * 同一张单子反复打开 / 打印预览 / 关掉再看，会把这 3.5s 付成常态。入参指纹相同 = 内容一样，
     * 直接回字节；每签一次状态与签名都变 → 指纹变 → 重渲染。
     */
    private byte[] renderLive(CageOpRequest req) {
        TransferFormRenderInput input = buildInput(req);
        String fingerprint = JSON.toJSONString(input);
        Long id = req.getId();
        if (id != null) {
            PdfCacheEntry hit = pdfCache.get(id);
            if (hit != null && hit.fingerprint.equals(fingerprint)) return hit.pdf;
        }
        byte[] pdf = TransferFormRenderer.renderToPdf(input, converter);
        if (id != null) pdfCache.put(id, new PdfCacheEntry(fingerprint, pdf));
        return pdf;
    }

    /**
     * 即时渲染缓存：requestId → (入参指纹, PDF 字节)，访问序 LinkedHashMap，超限淘汰最久未用的。
     *
     * <p>ponytail: 进程内单实例、重启即空，多实例部署各存各的；单条约 125KB，上限 128 条（≈16MB）。
     * 要跨重启 / 跨实例共享就换 Caffeine + 指纹落盘，当前不值当。
     */
    private static final int PDF_CACHE_MAX = 128;

    private final Map<Long, PdfCacheEntry> pdfCache = Collections.synchronizedMap(
            new LinkedHashMap<>(16, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<Long, PdfCacheEntry> eldest) {
                    return size() > PDF_CACHE_MAX;
                }
            });

    private record PdfCacheEntry(String fingerprint, byte[] pdf) {
    }

    /** 有效配对：新单读 pairs；存量单（pairs 空）按老列推 —— 一个源 × N 个目标 = N 对，源相同。 */
    private static List<CageOpPair> effectivePairs(CageOpRequest req) {
        List<CageOpPair> pairs = req.pairs();
        if (!pairs.isEmpty()) return pairs;
        List<CageOpPair> legacy = new ArrayList<>();
        Long src = req.getSourceAnimalCageId();
        for (Long t : req.targetIds()) {
            CageOpPair p = new CageOpPair();
            p.setSource(src);
            p.setTarget(t);
            legacy.add(p);
        }
        return legacy;
    }

    /** 每个不同的源笼位各解析一次 detail（源可能在多对里重复，只查一次）。 */
    private Map<Long, CageCellDetail> resolveDetails(List<CageOpPair> pairs) {
        Map<Long, CageCellDetail> out = new HashMap<>();
        for (CageOpPair p : pairs) {
            Long sid = p == null ? null : p.getSource();
            if (sid == null) continue;
            out.computeIfAbsent(sid, detailMapper::selectByAnimalCageId);
        }
        return out;
    }

    /** 每个不同的源笼位各读一次表单值（cage_info_value），与 resolveDetails 同去重。 */
    private Map<Long, Map<String, Object>> resolveForms(List<CageOpPair> pairs) {
        Map<Long, Map<String, Object>> out = new HashMap<>();
        for (CageOpPair p : pairs) {
            Long sid = p == null ? null : p.getSource();
            if (sid == null) continue;
            out.computeIfAbsent(sid, this::formValues);
        }
        return out;
    }

    /** 所有 pair 的源 + 目标位置一次性批量反查，按 animalCageId 归集（替代逐条 lookup，避免 N+1）。 */
    private Map<Long, Map<String, Object>> resolveLocations(List<CageOpPair> pairs) {
        LinkedHashSet<Long> ids = new LinkedHashSet<>();
        for (CageOpPair p : pairs) {
            if (p == null) continue;
            if (p.getSource() != null) ids.add(p.getSource());
            if (p.getTarget() != null) ids.add(p.getTarget());
        }
        Map<Long, Map<String, Object>> byId = new LinkedHashMap<>();
        if (ids.isEmpty()) return byId;
        List<Map<String, Object>> rows = cellIndexMapper.lookupByAnimalCageIds(new ArrayList<>(ids));
        if (rows != null) {
            for (Map<String, Object> row : rows) {
                Long id = toLong(row.get("animalCageId"));
                if (id != null) byId.put(id, row);
            }
        }
        return byId;
    }

    /**
     * 一个 pair 一行，行号与 pair 下标一致；该行自动值取这一对**自己的源**（批量转移里源各不相同，
     * 用一个任意源会把别的源的动物写到这行上）。人工值仍由渲染器的三个纯函数优先。自动值表单优先，detail 兜底。
     */
    static List<TransferFormRenderInput.Row> buildRows(TransferFormData data, List<CageOpPair> pairs,
                                                       Map<Long, CageCellDetail> details,
                                                       Map<Long, Map<String, Object>> forms) {
        List<TransferFormRenderInput.Row> rows = new ArrayList<>();
        for (int i = 0; i < pairs.size(); i++) {
            CageOpPair p = pairs.get(i);
            Long sid = p == null ? null : p.getSource();
            CageCellDetail src = sid == null ? null : details.get(sid);
            Map<String, Object> form = sid == null ? null : forms.get(sid);
            String autoStrain = firstNonBlank(
                    str(form == null ? null : form.get("animal_strain_name")),
                    src == null ? null : src.getAnimalStrainName());
            Integer autoFemale = firstInt(
                    toInt(form == null ? null : form.get("animal_female_number")),
                    src == null ? null : src.getAnimalFemaleNumber());
            Integer autoMale = firstInt(
                    toInt(form == null ? null : form.get("animal_male_number")),
                    src == null ? null : src.getAnimalMaleNumber());
            TransferFormRenderInput.Row row = new TransferFormRenderInput.Row();
            row.setStrain(TransferFormRenderer.strainOf(data, i, autoStrain));
            row.setFemale(TransferFormRenderer.femaleOf(data, i, autoFemale));
            row.setMale(TransferFormRenderer.maleOf(data, i, autoMale));
            rows.add(row);
        }
        return rows;
    }

    /**
     * 每个 pair 一个位置（source=true 取源、否则取目标），顺序与数据行一致；多对时加 {@code 1. } 前缀，
     * 单对不加前缀（与存量单字面一致）。位置标签统一走 {@link #locationLabel}，不再有第二条拼法。
     */
    static String pairLocations(List<CageOpPair> pairs, boolean source,
                                Map<Long, Map<String, Object>> locById) {
        if (pairs.isEmpty()) return null;
        List<String> labels = new ArrayList<>();
        for (CageOpPair p : pairs) {
            Long id = p == null ? null : (source ? p.getSource() : p.getTarget());
            String label = locationLabel(locById.get(id));
            if (label != null && !label.isBlank()) labels.add(label);
        }
        if (labels.isEmpty()) return null;
        if (pairs.size() == 1) return labels.get(0);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < labels.size(); i++) {
            if (i > 0) sb.append('\n');
            sb.append(i + 1).append(". ").append(labels.get(i));
        }
        return sb.toString();
    }

    /**
     * 位置标签：{@code 校区 / 笼架 / 位号}，例 {@code 浦东 / 201A-1 / F-4}。
     *
     * <p><b>笼架名以房号开头时省略房号</b>：笼架 {@code 201A-1} 本就属于房间 {@code 201A}，
     * 再列一层房号是纯重复（用户 2026-09-18 定）。笼架名不含房号时仍列三层，不丢信息。
     *
     * <p>位号直接用 {@code /} 接在后面，不再写「坐标」二字。
     *
     * <p>static 是因为「写进单子的位置」与「卡片上的位置」只该有一套拼法，别在别处再拼一遍。
     * 推送通知也走这个方法，改一处两边都变。
     */
    static String locationLabel(Map<String, Object> loc) {
        if (loc == null) return null;
        String campus = str(loc.get("campusName"));
        String room = str(loc.get("roomName"));
        String shelf = str(loc.get("shelveName"));
        boolean hasCampus = campus != null && !campus.isBlank();
        boolean hasRoom = room != null && !room.isBlank();
        boolean hasShelf = shelf != null && !shelf.isBlank();
        // 笼架名带着房号（201A-1 含 201A）就不再重复列房号
        boolean shelfCarriesRoom = hasShelf && hasRoom && shelf.startsWith(room);
        List<String> parts = new ArrayList<>();
        if (hasCampus) parts.add(campus);
        if (hasRoom && !shelfCarriesRoom) parts.add(room);
        if (hasShelf) parts.add(shelf);
        String base = String.join(" / ", parts);
        String pos = positionLabel(loc.get("positionX"), loc.get("positionY"));
        if (pos == null) return base.isEmpty() ? null : base;
        return (base.isEmpty() ? "" : base + " / ") + pos;
    }

    /** 位号：与前端 {@code cagePositionLabel} 同源 —— 列 {@code A+x-1}，行就是 y；坐标不全返回 null。 */
    static String positionLabel(Object xRaw, Object yRaw) {
        Integer x = toInt(xRaw);
        Integer y = toInt(yRaw);
        if (x == null || y == null) return null;
        return (char) ('A' + Math.max(0, x - 1)) + "-" + y;
    }

    // ═══════════════════════════════════════════
    // 归档
    // ═══════════════════════════════════════════

    /**
     * 终局归档：渲染一次，落盘到 {@code app.cage.transfer-form-dir}，把**文件名**写回 req。
     *
     * <p>只做转移单、只在终局做、且只做一次（{@code transfer_form_file_ref} 已有值就跳过）——
     * 双签路径与旧单签路径都会走到这里，防重就靠这一个判据。
     *
     * <p>调用方负责兜异常：渲染/转换/写盘失败都不该把审核结果拖下水。
     */
    public void archive(CageOpRequest req) throws IOException {
        if (req == null || !CageOpRequest.TYPE_TRANSFER.equals(req.getOpType())) return;
        if (!CageOpRequest.STATUS_APPROVED.equals(req.getStatus())
                && !CageOpRequest.STATUS_REJECTED.equals(req.getStatus())) {
            return;
        }
        if (req.getTransferFormFileRef() != null && !req.getTransferFormFileRef().isBlank()) return;

        byte[] pdf = renderPdf(req);
        if (pdf == null || pdf.length == 0) throw new IOException("转移单渲染产物为空");
        String name = displayFileName(req);
        Files.createDirectories(storageDir);
        Files.write(storageDir.resolve(name), pdf);
        req.setTransferFormFileRef(name);
        log.info("[transfer-form] 归档 requestId={} file={} size={}", req.getId(), name, pdf.length);
    }

    /**
     * 把多张转移单合成一份多页 PDF（批量打印用）。顺序即入参顺序，前端按列表顺序传。
     *
     * <p>单张时原样返回：合并一趟只是把字节搬一遍，没有任何增益，还多一次解析。
     *
     * <p>用 PDFBox 的 {@link PDFMergerUtility}（与报表导出同一套写法）。它不重排版，
     * 各页的字体与尺寸原样带过去 —— 合出来的每一页与单张下载看到的完全一样。
     */
    public static byte[] mergePdfs(List<byte[]> parts) throws IOException {
        if (parts == null || parts.isEmpty()) throw new IOException("没有可合并的转移单");
        if (parts.size() == 1) return parts.get(0);
        ByteArrayOutputStream merged = new ByteArrayOutputStream();
        PDFMergerUtility merger = new PDFMergerUtility();
        merger.setDestinationStream(merged);
        for (byte[] part : parts) {
            merger.addSource(new RandomAccessReadBuffer(part));
        }
        merger.mergeDocuments(null);
        return merged.toByteArray();
    }

    /**
     * 单号 = 拟转移日期 + 实验员姓名 + 该日期下的第几单，如 {@code 20260920-位亚磊-1}。
     *
     * <p><b>只是给人看的名字</b>，数据库主键仍是 {@code cage_op_request.id} —— 单号会随实验员改名、
     * 也允许重复号（不同人同日同号不可能，但历史单的日期可能被补填），任何地方都别拿它当键。
     *
     * <p>编号恒带（第一单也是 -1）：只在多单时才编号的话，第一单的号会随第二单出现而变，
     * 已经打印出去的单号就对不上了。
     *
     * <p>日期取**学生在单子上填的拟定转移日期**（这是复核和归档时人真正在看的日期），
     * 没填才退回提交日。编号也只按这个日期分组 —— 按提交日分组的话，「9/18 提交、9/20 转移」
     * 与「9/18 提交、9/21 转移」会连号，看起来像同一天的两单。
     */
    public String docNo(CageOpRequest req) {
        if (req == null) return "";
        String dateKey = effectiveDateKey(req);
        return composeDocNo(dateKey, req.getApplicantName(), seqFor(req, dateKey));
    }

    /**
     * 转移单对外的文件名 —— 就是单号加扩展名。
     *
     * <p>归档落盘名与下载响应头用**同一个**名字：磁盘上一套、用户看到的又一套时，
     * 对着一份纸找文件就找不着了，而单号存在的意义正是这个。
     */
    public String displayFileName(CageOpRequest req) {
        return docNo(req) + ".pdf";
    }

    /** {@link #docNo} 的纯拼装（抽出来便于单测，构造真实例要 12 个依赖）。 */
    static String composeDocNo(String dateKey, String applicantName, int seq) {
        String who = sanitizeFileNamePart(applicantName);
        StringBuilder sb = new StringBuilder(dateKey == null || dateKey.isBlank() ? todayKey() : dateKey);
        if (!who.isEmpty()) sb.append('-').append(who);
        return sb.append('-').append(seq < 1 ? 1 : seq).toString();
    }

    /**
     * 同一实验员、同一拟定转移日期下的第几单（按 id 序，含本单）。
     *
     * <p>在 Java 里比而不是下 SQL：拟定转移日期存在 {@code transfer_form} 这个 JSON 列里，
     * 用 {@code JSON_EXTRACT} 去比会撞上生产库那两拨 collation，踩过 1267。一个实验员总共也就几十单，
     * 拉回来筛便宜且没有踩坑面。
     *
     * <p>还没落库（预填）时取「下一个」，让草稿号看起来是连续的。
     */
    private int seqFor(CageOpRequest req, String dateKey) {
        String applicant = req.getApplicantId();
        if (applicant == null || applicant.isBlank()) return 1;
        try {
            int sameDateBefore = 0;
            int sameDateAll = 0;
            for (CageOpRequest r : opMapper.selectByApplicant(applicant, null)) {
                if (r == null || !CageOpRequest.TYPE_TRANSFER.equals(r.getOpType())) continue;
                if (!dateKey.equals(effectiveDateKey(r))) continue;
                sameDateAll++;
                // req.getId() == null：预填，还没这一单，数全部再 +1
                if (req.getId() != null && r.getId() != null && r.getId() <= req.getId()) sameDateBefore++;
            }
            if (req.getId() == null) return sameDateAll + 1;
            return sameDateBefore <= 0 ? 1 : sameDateBefore;
        } catch (Exception e) {
            // 查不动就退回 1 —— 单号不值得让整张单子打不出来
            log.warn("[transfer-form] 取单号序号失败 requestId={}: {}", req.getId(), e.getMessage());
            return 1;
        }
    }

    /** 编号分组用的日期键：学生填的拟定转移日期优先，没填退回提交日。 */
    private String effectiveDateKey(CageOpRequest req) {
        TransferFormData data = parseForm(req.getTransferForm());
        String fromForm = normalizeDate(data == null ? null : data.getTransferDate());
        return fromForm != null ? fromForm : dayOf(req.getCreatedAt());
    }

    /** {@code 2026-09-20} / {@code 2026/9/20} 一类的写法统一成 {@code 20260920}；认不出返回 null。 */
    static String normalizeDate(String s) {
        if (s == null || s.isBlank()) return null;
        String digits = s.replaceAll("[^0-9]", "");
        return digits.length() >= 8 ? digits.substring(0, 8) : null;
    }

    /** {@code createdAt} 是 {@code yyyy-MM-dd HH:mm:ss}；取不到就退回今天。 */
    static String dayOf(String createdAt) {
        String d = normalizeDate(createdAt);
        return d != null ? d : todayKey();
    }

    private static String todayKey() {
        return java.time.LocalDate.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd"));
    }

    /** 单号里不能出现路径分隔符与控制字符；全空返回空串，调用方少拼一段。 */
    static String sanitizeFileNamePart(String s) {
        if (s == null) return "";
        return s.replaceAll("[\\\\/:*?\"<>|\\r\\n\\t]", "").trim();
    }

    /** 读归档字节；没归档 / 文件已丢都返回 null（调用方回 404，前端退回即时渲染，用户无感）。 */
    public byte[] readArchived(CageOpRequest req) {
        if (req == null) return null;
        String ref = req.getTransferFormFileRef();
        if (ref == null || ref.isBlank()) return null;
        // 只取文件名再拼：ref 虽然是自己写的，但库值也可能被写坏，路径拼装一律不信任
        Path file = storageDir.resolve(Path.of(ref).getFileName());
        if (!Files.isRegularFile(file)) return null;
        try {
            return Files.readAllBytes(file);
        } catch (IOException e) {
            log.warn("[transfer-form] 读取归档失败 requestId={} file={}: {}", req.getId(), ref, e.getMessage());
            return null;
        }
    }

    // ═══════════════════════════════════════════
    // 读权限
    // ═══════════════════════════════════════════

    /**
     * 谁能看这条转移单：申请人本人、能审这条单的人（作用域覆盖源或任一目标笼位）、
     * 还没签兽医关的**全局审核兽医**、全局可见者。
     *
     * <p>判据与 {@code CageOperationService} 的待审/审批门完全同源（同一份
     * {@link CageRegionGrantService.ReviewAuthority} + 同一组笼位），所以「列表里看得到这条单」
     * 与「能下这张 PDF」不会脱节。
     *
     * <p>兽医那条腿复用 {@link CageOperationService#vetCanSeePending}：名单不分区域，
     * 只按区域收口的话，待审列表放进来的人也打不开自己被要求签的单子。
     */
    public boolean canView(User user, CageOpRequest req) {
        if (user == null || user.getId() == null || req == null) return false;
        if (visibilityPolicy.isGlobalViewer(user)) return true;
        if (user.getId().equals(req.getApplicantId())) return true;
        if (CageOperationService.vetCanSeePending(reviewVetService.canSignAsVet(user.getId()), req)) return true;
        CageRegionGrantService.ReviewAuthority auth = regionGrantService.reviewAuthority(user);
        if (auth.global()) return true;
        if (!auth.active()) return false;
        for (Map<String, Object> loc : involvedLocations(req)) {
            if (loc != null && auth.covers(str(loc.get("roomId")), str(loc.get("floorId")),
                    str(loc.get("campusId")))) {
                return true;
            }
        }
        return false;
    }

    /**
     * 本条请求涉及的**全部**笼位 id：源恒最前，其余跨 pair 的源与目标保序去重补上。
     * 与 {@code CageOperationService.locationsOf} 的审核作用域同一组 —— 一个 pair 的源与目标都要算，
     * 多源批量单不能只认老列写的 pairs[0].source。
     */
    static List<Long> involvedLocationIds(CageOpRequest req) {
        LinkedHashSet<Long> ids = new LinkedHashSet<>();
        if (req.getSourceAnimalCageId() != null) ids.add(req.getSourceAnimalCageId());
        ids.addAll(req.involvedCageIds());
        return new ArrayList<>(ids);
    }

    /** 本条请求涉及的全部位置：源笼位 + 全部目标笼位（与审核作用域判的是同一组）。 */
    private List<Map<String, Object>> involvedLocations(CageOpRequest req) {
        List<Map<String, Object>> out = new ArrayList<>();
        List<Long> ids = involvedLocationIds(req);
        if (!ids.isEmpty()) {
            List<Map<String, Object>> rows = cellIndexMapper.lookupByAnimalCageIds(ids);
            if (rows != null) out.addAll(rows);
        }
        return out;
    }

    /** 取一条请求；不存在 → 404。 */
    public CageOpRequest findRequest(Long requestId) {
        if (requestId == null) throw new TwinBusinessException(400, "requestId 必填");
        CageOpRequest req = opMapper.selectById(requestId);
        if (req == null) throw new TwinBusinessException(404, "操作请求不存在");
        return req;
    }

    // ═══════════════════════════════════════════
    // 解析 / 小工具
    // ═══════════════════════════════════════════

    /** 学生填的值。空 / 坏 JSON 都返回 null（每项各自退回自动值），不让一张填歪的单子把审核链炸掉。 */
    static TransferFormData parseForm(String json) {
        if (json == null || json.isBlank()) return null;
        try {
            return JSON.parseObject(json, TransferFormData.class);
        } catch (Exception e) {
            log.warn("[transfer-form] transfer_form JSON 解析失败: {}", e.getMessage());
            return null;
        }
    }

    private String applicantName(String applicantId) {
        if (applicantId == null || applicantId.isBlank()) return null;
        try {
            String name = userDisplayNameService.resolveDisplayName(applicantId);
            return (name == null || name.isBlank()) ? null : name;
        } catch (Exception e) {
            return null;
        }
    }

    private String applicantPhone(String applicantId) {
        if (applicantId == null || applicantId.isBlank()) return null;
        try {
            Personnel p = personnelService.resolveByAccount(applicantId);
            String phone = p == null ? null : p.getMobilePhone();
            if (phone != null && !phone.isBlank()) return phone.trim();
            User u = userMapper.findById(applicantId);
            return u == null ? null : u.getMobilePhone();
        } catch (Exception e) {
            return null;
        }
    }

    /** 读某笼位表单值（cage_info_value）的 canonical → 值索引；读失败 / 无笼位退回空表，各字段自动退 detail。 */
    private Map<String, Object> formValues(Long animalCageId) {
        Map<String, Object> out = new HashMap<>();
        if (animalCageId == null) return out;
        try {
            for (Map<String, Object> row : cageInfoValueService.getInfo(animalCageId)) {
                String canonical = str(row.get("canonical"));
                if (canonical != null) out.put(canonical, row.get("value"));
            }
        } catch (Exception e) {
            log.warn("[transfer-form] 读笼位表单值失败 cageId={}: {}", animalCageId, e.getMessage());
        }
        return out;
    }

    private static String reviewerOf(List<CageOpSignature> sigs, String role) {
        CageOpSignature s = signatureOf(sigs, role);
        return s == null ? null : s.getReviewerName();
    }

    private static CageOpSignature signatureOf(List<CageOpSignature> sigs, String role) {
        if (sigs == null) return null;
        for (CageOpSignature s : sigs) {
            if (s != null && role.equals(s.getRole())) return s;
        }
        return null;
    }

    private static String firstNonBlank(String... values) {
        for (String v : values) {
            if (v != null && !v.isBlank()) return v.trim();
        }
        return null;
    }

    private static Integer firstInt(Integer... values) {
        for (Integer v : values) {
            if (v != null) return v;
        }
        return null;
    }

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v).trim();
    }

    private static Integer toInt(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static Long toLong(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        try {
            return Long.parseLong(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
