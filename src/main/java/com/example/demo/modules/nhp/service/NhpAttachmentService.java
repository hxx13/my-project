package com.example.demo.modules.nhp.service;

import com.example.demo.common.dto.Result;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.nhp.dto.NhpAttachmentVO;
import com.example.demo.modules.nhp.entity.CrfAttachment;
import com.example.demo.modules.nhp.entity.CrfRecord;
import com.example.demo.modules.nhp.mapper.CrfAttachmentMapper;
import com.example.demo.modules.nhp.mapper.CrfRecordMapper;
import com.example.demo.modules.upload.entity.UploadFileRecord;
import com.example.demo.modules.upload.service.UploadFileRecordService;
import com.example.demo.modules.upload.service.UploadFileStorageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.List;

/** NHP 表单实例附件（镜像 AUP 附件流程）。 */
@Service
public class NhpAttachmentService {

    private static final Logger log = LoggerFactory.getLogger(NhpAttachmentService.class);

    private final CrfRecordMapper recordMapper;
    private final CrfAttachmentMapper attachmentMapper;
    private final UploadFileStorageService uploadFileStorageService;
    private final UploadFileRecordService uploadFileRecordService;

    @Value("${nhp.attachment.max-size:20971520}")
    private long maxAttachmentSize;

    @Value("${nhp.attachment.max-count:10}")
    private int maxAttachmentCount;

    public NhpAttachmentService(CrfRecordMapper recordMapper,
                                CrfAttachmentMapper attachmentMapper,
                                UploadFileStorageService uploadFileStorageService,
                                UploadFileRecordService uploadFileRecordService) {
        this.recordMapper = recordMapper;
        this.attachmentMapper = attachmentMapper;
        this.uploadFileStorageService = uploadFileStorageService;
        this.uploadFileRecordService = uploadFileRecordService;
    }

    private CrfRecord requireRecord(Long recordId) {
        CrfRecord record = recordMapper.findById(recordId);
        if (record == null) {
            throw TwinBusinessException.of(404, "表单实例不存在");
        }
        if ("DELETED".equals(record.getStatus())) {
            throw TwinBusinessException.of(400, "表单实例已删除");
        }
        return record;
    }

    @Transactional
    public Result<NhpAttachmentVO> upload(Long recordId, MultipartFile file, String operatorId) {
        requireRecord(recordId);
        if (file == null || file.isEmpty()) {
            return Result.fail(400, "文件不能为空");
        }
        if (file.getSize() > maxAttachmentSize) {
            return Result.fail(400, "文件大小超过上限");
        }
        int count = attachmentMapper.countActiveByRecordId(recordId);
        if (count >= maxAttachmentCount) {
            return Result.fail(400, "附件数量已达上限 " + maxAttachmentCount + " 个");
        }
        try {
            UploadFileStorageService.StoredUploadFile stored = uploadFileStorageService.store(file, "NHP");
            CrfAttachment att = new CrfAttachment();
            att.setRecordId(recordId);
            att.setFileId(stored.recordId());
            att.setFileName(file.getOriginalFilename());
            att.setCreatedBy(operatorId);
            att.setDeleted(0);
            attachmentMapper.insert(att);
            UploadFileRecord r = uploadFileRecordService.findById(stored.recordId());
            return Result.success(toVo(att, r));
        } catch (TwinBusinessException e) {
            throw e;
        } catch (Exception e) {
            log.warn("[NHP] 附件上传失败 recordId={} err={}", recordId, e.getMessage());
            return Result.fail(500, "附件上传失败：" + e.getMessage());
        }
    }

    public Result<List<NhpAttachmentVO>> list(Long recordId) {
        requireRecord(recordId);
        List<NhpAttachmentVO> out = new ArrayList<>();
        for (CrfAttachment att : attachmentMapper.selectActiveByRecordId(recordId)) {
            out.add(toVo(att, uploadFileRecordService.findById(att.getFileId())));
        }
        return Result.success(out);
    }

    public UploadFileRecord resolveDownload(Long fileId) {
        CrfAttachment att = attachmentMapper.selectByFileId(fileId);
        if (att == null || (att.getDeleted() != null && att.getDeleted() == 1)) {
            throw TwinBusinessException.of(404, "附件不存在");
        }
        requireRecord(att.getRecordId());
        UploadFileRecord r = uploadFileRecordService.findById(fileId);
        if (r == null) {
            throw TwinBusinessException.of(404, "附件文件不存在");
        }
        return r;
    }

    @Transactional
    public Result<?> delete(Long recordId, Long fileId) {
        requireRecord(recordId);
        CrfAttachment att = attachmentMapper.selectByRecordIdAndFileId(recordId, fileId);
        if (att == null || (att.getDeleted() != null && att.getDeleted() == 1)) {
            return Result.fail(404, "附件不存在");
        }
        attachmentMapper.softDeleteById(att.getId());
        return Result.success();
    }

    private NhpAttachmentVO toVo(CrfAttachment att, UploadFileRecord r) {
        NhpAttachmentVO vo = new NhpAttachmentVO();
        vo.setFileId(att.getFileId());
        vo.setFileName(att.getFileName());
        vo.setUploadedBy(att.getCreatedBy());
        vo.setCreatedAt(att.getCreatedAt());
        if (r != null) {
            vo.setMimeType(r.getMimeType());
            vo.setSize(r.getSizeBytes());
            vo.setUrl(r.getPublicUrl());
        }
        return vo;
    }
}
