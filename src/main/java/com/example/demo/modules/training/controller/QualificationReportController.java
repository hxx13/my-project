package com.example.demo.modules.training.controller;

import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.training.service.QualificationReportService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** 健康报告预览：把模板 + 表单数据渲染成 PDF 供后台查看。 */
@RestController
@RequestMapping("/api/admin/training/qualifications")
public class QualificationReportController {

    private final QualificationReportService reportService;
    private final AuthContextService authContextService;
    private final HttpServletRequest request;

    public QualificationReportController(QualificationReportService reportService,
                                         AuthContextService authContextService,
                                         HttpServletRequest request) {
        this.reportService = reportService;
        this.authContextService = authContextService;
        this.request = request;
    }

    /**
     * 预览：submissionId 为空时用空白数据渲染模板（看版式），
     * 传了则渲染该条提交（看真实效果）。
     */
    @GetMapping("/preview")
    public ResponseEntity<byte[]> preview(@RequestParam Long formId,
                                          @RequestParam(required = false) String wordTemplateId,
                                          @RequestParam(required = false) Long submissionId) {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) return ResponseEntity.status(401).build();
        try {
            byte[] pdf = reportService.generate(formId, submissionId, wordTemplateId);
            return ResponseEntity.ok()
                    .header("Content-Type", "application/pdf")
                    .header("Content-Disposition", "inline; filename=\"preview.pdf\"")
                    .body(pdf);
        } catch (Exception e) {
            return ResponseEntity.status(500).build();
        }
    }
}
