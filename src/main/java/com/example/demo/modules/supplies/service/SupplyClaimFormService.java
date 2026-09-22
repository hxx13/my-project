package com.example.demo.modules.supplies.service;

import com.example.demo.modules.adminfile.OfficeToPdfConverter;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.personnel.service.PersonnelService;
import com.example.demo.modules.personnel.service.PersonnelSignatureService;
import com.example.demo.modules.supplies.dto.SupplyClaimFormInput;
import com.example.demo.modules.supplies.entity.SupplyClaimLine;
import com.example.demo.modules.supplies.entity.SupplyClaimOrder;
import com.example.demo.modules.supplies.mapper.SupplyClaimLineMapper;
import com.example.demo.modules.supplies.mapper.SupplyClaimOrderMapper;
import org.apache.pdfbox.io.RandomAccessReadBuffer;
import org.apache.pdfbox.multipdf.PDFMergerUtility;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * 领用单：把一条领用订单组装成渲染入参、渲染 PDF。
 *
 * <p><b>所有取值判断都在这层的 {@link #buildInput}</b>，{@link SupplyClaimFormRenderer} 只按行往模板里写。
 *
 * <p>与转移单（{@code TransferFormService}）同套路，差别只有两处：这里**不吃高度**（A4 一页放得下
 * 10~20 行），所以签名用内联图而不是浮动锚定；落档复用物资自己的 {@code supply_claim_export_file}
 * 分享链路，不再另造一套归档表。
 */
@Service
public class SupplyClaimFormService {

    private static final Logger log = LoggerFactory.getLogger(SupplyClaimFormService.class);

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter DAY_KEY_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");

    /** 算「今天第几单」时最多回溯多少条历史单 —— 一个申请人几十单，500 足够。 */
    private static final int SEQ_LOOKBACK = 500;

    private final SupplyClaimOrderMapper orderMapper;
    private final SupplyClaimLineMapper lineMapper;
    private final PersonnelService personnelService;
    private final PersonnelSignatureService signatureService;
    private final UserDisplayNameService userDisplayNameService;
    private final OfficeToPdfConverter converter;

    public SupplyClaimFormService(SupplyClaimOrderMapper orderMapper,
                                  SupplyClaimLineMapper lineMapper,
                                  PersonnelService personnelService,
                                  PersonnelSignatureService signatureService,
                                  UserDisplayNameService userDisplayNameService,
                                  OfficeToPdfConverter converter) {
        this.orderMapper = orderMapper;
        this.lineMapper = lineMapper;
        this.personnelService = personnelService;
        this.signatureService = signatureService;
        this.userDisplayNameService = userDisplayNameService;
        this.converter = converter;
    }

    // ═══════════════════════════════════════════
    // 组装
    // ═══════════════════════════════════════════

    /**
     * 组装渲染入参。
     *
     * <p>取值口径：
     * <ul>
     *   <li>填单日期 = 提交日（{@code created_at}）；**实际领用日期与实际出库量只在已出库时印** ——
     *       待出库的单子印个 0 会被读成「实发 0」，留白才是对的（那两栏本来就是给出库时填的）</li>
     *   <li>领用楼层、型号规格、备注、签名都可能没有（**历史单尤其如此**）：没有就不写，格子留白手写</li>
     *   <li>领用人姓名优先用提交时的快照，老记录快照为空时按申请人账号现查</li>
     * </ul>
     */
    public SupplyClaimFormInput buildInput(SupplyClaimOrder order) {
        if (order == null) throw new IllegalArgumentException("领用单组装入参不能为空");
        boolean fulfilled = "FULFILLED".equals(order.getStatus());
        SupplyClaimFormInput in = new SupplyClaimFormInput();
        in.setDocNo(docNo(order));
        in.setApplicantName(applicantName(order));
        in.setClaimFloor(order.getClaimFloor());
        in.setFillDate(date(order.getCreatedAt()));
        in.setIssueDate(fulfilled ? date(order.getFulfilledAt()) : null);
        for (SupplyClaimLine l : lineMapper.listByOrderId(order.getId())) {
            if (l == null) continue;
            SupplyClaimFormInput.Row row = new SupplyClaimFormInput.Row();
            row.setName(l.getSnapshotName());
            row.setSpec(l.getSpecSnapshot());
            row.setQty(l.getQty());
            row.setFulfilledQty(fulfilled ? l.getFulfilledQty() : null);
            row.setRemark(l.getRemark());
            in.getRows().add(row);
        }
        in.setApplicantSignature(signatureImage(order.getUserId()));
        in.setIssuerSignature(fulfilled ? signatureImage(order.getFulfilledBy()) : null);
        return in;
    }

    /** 领用人姓名：提交时的快照优先（历史单靠它），快照为空才按账号现查。 */
    private String applicantName(SupplyClaimOrder order) {
        if (StringUtils.hasText(order.getApplicantName())) return order.getApplicantName();
        if (!StringUtils.hasText(order.getUserId())) return null;
        try {
            return userDisplayNameService.resolveDisplayName(order.getUserId());
        } catch (Exception e) {
            return null;
        }
    }

    /** 渲染 PDF（即时，读的是当下的库）。转 PDF 要 LibreOffice，慢的那一步在转换器里。 */
    public byte[] renderPdf(SupplyClaimOrder order) {
        return SupplyClaimFormRenderer.renderToPdf(buildInput(order), converter);
    }

    /**
     * 把多张领用单合成一份多页 PDF（批量导出用）。顺序即入参顺序。
     *
     * <p>单张时原样返回：合并一趟只是把字节搬一遍，没有任何增益，还多一次解析。
     * 用 PDFBox 的 {@link PDFMergerUtility}（与转移单、报表导出同一套写法）—— 它不重排版，
     * 合出来的每一页与单张下载看到的完全一样。
     */
    public static byte[] mergePdfs(List<byte[]> parts) throws IOException {
        if (parts == null || parts.isEmpty()) throw new IOException("没有可合并的领用单");
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

    // ═══════════════════════════════════════════
    // 单号
    // ═══════════════════════════════════════════

    /**
     * 单号 = **出库日** + 申请人姓名 + 该日期下的第几单，如 {@code 20260923-位亚磊-1}。
     *
     * <p>**只是给人看的名字**，主键仍是 {@code supply_claim_order.id}。印在标题下面，下载文件名也用它。
     *
     * <p>日期取**出库日**（没出库才退回提交日）：同一批出库的单子排在一起，跟仓库实际作业的批次对齐 ——
     * 用提交日分组的话，「9/21 提交、9/23 出库」与「9/23 提交、9/23 出库」会分成两组。
     */
    public String docNo(SupplyClaimOrder order) {
        if (order == null) return "";
        String dateKey = effectiveDayKey(order);
        return composeDocNo(dateKey, order.getApplicantName(), seqFor(order, dateKey));
    }

    /** {@link #docNo} 的纯拼装（抽出来便于单测）。 */
    static String composeDocNo(String dateKey, String applicantName, int seq) {
        String who = sanitizeFileNamePart(applicantName);
        StringBuilder sb = new StringBuilder(dateKey == null || dateKey.isBlank() ? "" : dateKey);
        if (!who.isEmpty()) sb.append('-').append(who);
        return sb.append('-').append(seq < 1 ? 1 : seq).toString();
    }

    /** 本人的第几单：同一天（同一出库日）里，提交时间不晚于本单的有几条。 */
    private int seqFor(SupplyClaimOrder order, String dateKey) {
        String applicant = order.getUserId();
        if (!StringUtils.hasText(applicant)) return 1;
        try {
            int n = 0;
            for (SupplyClaimOrder r : orderMapper.listMine(applicant, null, SEQ_LOOKBACK, 0)) {
                if (r == null || !dateKey.equals(effectiveDayKey(r))) continue;
                if (order.getCreatedAt() != null && r.getCreatedAt() != null
                        && r.getCreatedAt().isAfter(order.getCreatedAt())) continue;
                n++;
            }
            return Math.max(1, n);
        } catch (Exception e) {
            // 查不动就退回 1 —— 单号不值得让整张单子打不出来
            return 1;
        }
    }

    private static String effectiveDayKey(SupplyClaimOrder r) {
        String fulfilled = dayKey(r.getFulfilledAt());
        return fulfilled != null ? fulfilled : dayKey(r.getCreatedAt());
    }

    static String dayKey(LocalDateTime t) {
        return t == null ? null : t.format(DAY_KEY_FMT);
    }

    /** 印在单子上的日期；取不到返回 null（那一栏留空）。 */
    static String date(LocalDateTime t) {
        return t == null ? null : t.format(DATE_FMT);
    }

    /** 单号里不能出现路径分隔符与控制字符；全空返回空串。 */
    static String sanitizeFileNamePart(String s) {
        if (s == null) return "";
        return s.replaceAll("[\\\\/:*?\"<>|\\r\\n\\t]", "").trim();
    }

    // ═══════════════════════════════════════════
    // 签名
    // ═══════════════════════════════════════════

    /**
     * 账号 id → 电子签名图（PNG dataUrl）。
     *
     * <p>签名按 {@code personnel_id} 存，而这里拿到的是**账号 id**，中间隔一次
     * {@link PersonnelService#resolveIdByAccount}。任一步查不到都返回 null —— 渲染器收到 null
     * 就让那一栏留白，单据不会因此打不出来。
     */
    private String signatureImage(String accountId) {
        if (!StringUtils.hasText(accountId)) return null;
        try {
            String pid = personnelService.resolveIdByAccount(accountId);
            if (!StringUtils.hasText(pid)) return null;
            Object img = signatureService.signatureByPersonnel(Long.parseLong(pid.trim())).get("imageData");
            return img == null ? null : String.valueOf(img);
        } catch (Exception e) {
            log.debug("[supply-claim-form] 取签名失败 account={}: {}", accountId, e.getMessage());
            return null;
        }
    }
}
