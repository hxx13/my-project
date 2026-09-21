package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.dto.TransferFormRenderInput;
import com.example.demo.modules.cageshelf.entity.CageOpRequest;
import com.example.demo.modules.cageshelf.service.TransferFormService;
import com.example.demo.modules.reportform.util.ReportFormExportFilename;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 转移单的三个鉴权端点：提交前预填 / 即时渲染 / 归档读回。
 *
 * <p><b>字节流只能从这里出去</b> —— 存储目录（{@code app.cage.transfer-form-dir}）是私有的，
 * 不当静态资源开放。单里含课题组、AUP 与动物数据，谁都不能凭 URL 猜到一个路径就读走。
 *
 * <p>即时渲染是常态（审核人要看最新状态），归档那份只作终局留痕；归档缺了前端就退回即时渲染，
 * 用户看不到差别，所以 {@code /archived} 404 不是故障。
 */
@RestController
@RequestMapping("/api/cage-op/transfer-form")
@Tag(name = "笼位操作（分笼/转移）")
public class TransferFormController {

    /** 一次合并的上限。单张约 120KB，50 张 ≈ 6MB，够一次打印任务用；再大多半是选错了。 */
    private static final int MAX_BATCH = 50;

    private final AuthContextService authContextService;
    private final TransferFormService transferFormService;

    public TransferFormController(AuthContextService authContextService,
                                  TransferFormService transferFormService) {
        this.authContextService = authContextService;
        this.transferFormService = transferFormService;
    }

    /**
     * 提交前预填。给的是「如果现在提交，单子上会打印什么」——后端算一遍，前端只展示。
     *
     * <p>刻意不落库、不要 requestId：弹窗里还没有那条请求。学生填的值在这条路上不参与
     * （它们就在前端手里），所以这里返回的全是自动值，前端拿它当「未改动」的基准线。
     */
    @GetMapping("/prefill")
    @Operation(summary = "提交前预填：自动值在单子上的最终形态（不落库）")
    public Result<TransferFormRenderInput> prefill(@RequestParam Long sourceAnimalCageId,
                                                   @RequestParam(required = false) List<Long> targetAnimalCageIds,
                                                   HttpServletRequest req) {
        User u = authContextService.resolveUserFromBearer(req.getHeader("Authorization"));
        if (u == null) throw new TwinBusinessException(401, "未登录");
        if (u.getStatus() != null && u.getStatus() == 0) throw new TwinBusinessException(401, "账号已禁用");
        return Result.success(transferFormService.prefill(sourceAnimalCageId, targetAnimalCageIds, u.getId()));
    }

    @GetMapping("/{requestId}")
    @Operation(summary = "即时渲染转移单 PDF（申请人本人 / 可审该单的人 / 全局可见者）")
    public ResponseEntity<byte[]> live(@PathVariable Long requestId, HttpServletRequest req) {
        CageOpRequest op = requireVisible(requestId, req);
        return pdf(transferFormService.renderPdf(op), transferFormService.displayFileName(op));
    }

    @GetMapping("/{requestId}/archived")
    @Operation(summary = "终局归档的转移单 PDF；没有归档返回 404（前端退回即时渲染）")
    public ResponseEntity<byte[]> archived(@PathVariable Long requestId, HttpServletRequest req) {
        CageOpRequest op = requireVisible(requestId, req);
        byte[] bytes = transferFormService.readArchived(op);
        if (bytes == null) throw new TwinBusinessException(404, "该请求没有归档的转移单");
        return pdf(bytes, transferFormService.displayFileName(op));
    }

    /**
     * 批量转移单 PDF：把选中的单**合并成一份多页**，一次打印任务打完。
     *
     * <p>body: {@code { "ids": [12, 31, 32] }}。顺序即打印顺序，前端按列表顺序传。
     *
     * <p>逐条做与单张完全相同的可见性判定：有一条看不见就整批 403 并点名是哪条 ——
     * 悄悄跳过会让审核人以为全都打出来了，而纸上少了一张是不会有人回头核的。
     */
    @PostMapping("/batch")
    @Operation(summary = "批量转移单 PDF（合并成一份多页）")
    public ResponseEntity<byte[]> batch(@RequestBody Map<String, Object> body, HttpServletRequest req) {
        User u = requireLogin(req);
        List<Long> ids = new ArrayList<>();
        if (body != null && body.get("ids") instanceof List<?> raw) {
            for (Object o : raw) {
                Long id = toLong(o);
                if (id != null && !ids.contains(id)) ids.add(id);
            }
        }
        if (ids.isEmpty()) throw new TwinBusinessException(400, "请先选择要打印的转移单");
        if (ids.size() > MAX_BATCH) {
            throw new TwinBusinessException(400, "一次最多合并 " + MAX_BATCH + " 张，当前选了 " + ids.size() + " 张");
        }
        List<byte[]> parts = new ArrayList<>();
        for (Long id : ids) {
            parts.add(transferFormService.renderPdf(requireVisible(u, id)));
        }
        byte[] merged;
        try {
            merged = TransferFormService.mergePdfs(parts);
        } catch (IOException e) {
            // 某张渲染不出来 / 合并失败：给业务错误，别把堆栈丢给审核人
            throw new TwinBusinessException(500, "合并转移单失败：" + e.getMessage());
        }
        return pdf(merged, batchFileName(ids.size()));
    }

    /** 合并件的下载名：说清楚有几张、什么时候打的就够，具体是哪几张在纸上看单号。 */
    private static String batchFileName(int count) {
        return "转移单合并-" + count + "张-"
                + java.time.LocalDateTime.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyyMMddHHmm"))
                + ".pdf";
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

    /**
     * 取单 + 鉴权，两步合一，两个端点共用。
     *
     * <p>顺序是刻意的：未登录 401 → 不存在 404 → 不是转移单 404 → 无权限 403。
     * 「不存在」与「不是转移单」先于权限判，因为对不存在的东西谈权限没有意义。
     */
    private CageOpRequest requireVisible(Long requestId, HttpServletRequest req) {
        return requireVisible(requireLogin(req), requestId);
    }

    private CageOpRequest requireVisible(User u, Long requestId) {
        CageOpRequest op = transferFormService.findRequest(requestId);
        if (!CageOpRequest.TYPE_TRANSFER.equals(op.getOpType())) {
            throw new TwinBusinessException(404, "该请求不是转移单");
        }
        if (!transferFormService.canView(u, op)) {
            throw new TwinBusinessException(403, "无权查看该转移单");
        }
        return op;
    }

    private User requireLogin(HttpServletRequest req) {
        User u = authContextService.resolveUserFromBearer(req.getHeader("Authorization"));
        if (u == null) throw new TwinBusinessException(401, "未登录");
        if (u.getStatus() != null && u.getStatus() == 0) throw new TwinBusinessException(401, "账号已禁用");
        return u;
    }

    /** 下载名由调用方给：单张是它的单号，批量是「转移单合并-N张-时刻」。 */
    private ResponseEntity<byte[]> pdf(byte[] body, String fileName) {
        return ResponseEntity.ok()
                .headers(ReportFormExportFilename.inlineHeaders(fileName))
                .header("Content-Type", "application/pdf")
                .body(body);
    }
}
