package com.example.demo.modules.reportform.service;

import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.modules.reportform.dto.ReportFormImportResult;
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

    public ReportFormDefinition createFromImport(ReportFormImportResult result, String username) {
        ReportFormDefinition def = new ReportFormDefinition();
        def.setName(result.getName());
        def.setStatus("draft");
        def.setLayoutJson(result.getLayoutJson());
        def.setThemeJson(getDefaultTheme());
        def.setFillPolicyJson("{\"mode\":\"shared\",\"submitLabel\":\"提交\",\"allowEditAfterSubmit\":true}");
        def.setPermissionJson("{\"visibleRoles\":[],\"visibleUserIds\":[],\"fieldRoleBindings\":{},\"allowUnboundView\":true}");
        def.setScheduleJson("{\"period\":\"manual\"}");
        def.setCreatedBy(username);
        def.setUpdatedBy(username);
        definitionMapper.insert(def);
        return def;
    }

    private String getDefaultTheme() {
        return "{\"headerBg\":\"var(--app-color-surface-container)\",\"headerColor\":\"var(--app-color-text-primary)\",\"headerFontSize\":13,\"headerBold\":true,\"headerAlign\":\"center\",\"zebraStripe\":true,\"oddRowBg\":\"var(--app-color-surface-page)\",\"evenRowBg\":\"var(--app-color-surface-container)\",\"borderWidth\":1,\"borderColor\":\"var(--app-color-border)\",\"borderRadius\":8,\"cellPadding\":8,\"defaultFontSize\":13,\"defaultAlign\":\"center\",\"columnWidths\":{},\"rowHeights\":{}}";
    }
}
