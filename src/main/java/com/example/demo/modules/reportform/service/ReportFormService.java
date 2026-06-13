package com.example.demo.modules.reportform.service;

import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.modules.reportform.entity.ReportFormDefinition;
import com.example.demo.modules.reportform.mapper.ReportFormDefinitionMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class ReportFormService {

    private static final Logger log = LoggerFactory.getLogger(ReportFormService.class);

    private final ReportFormDefinitionMapper definitionMapper;

    public ReportFormService(ReportFormDefinitionMapper definitionMapper) {
        this.definitionMapper = definitionMapper;
    }

    public List<ReportFormDefinition> page() {
        return definitionMapper.selectPage();
    }

    public ReportFormDefinition getById(Long id) {
        ReportFormDefinition def = definitionMapper.selectById(id);
        if (def == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.NOT_FOUND, "报表表单不存在");
        }
        return def;
    }
}
