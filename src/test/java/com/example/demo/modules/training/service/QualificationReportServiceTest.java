package com.example.demo.modules.training.service;

import com.example.demo.modules.document.service.DocxToPdfConverter;
import com.example.demo.modules.reportform.entity.ReportFormDefinition;
import com.example.demo.modules.reportform.mapper.ReportFormDefinitionMapper;
import com.example.demo.modules.reportform.mapper.ReportFormSubmissionMapper;
import com.example.demo.modules.reportform.service.ReportFormWordService;
import com.example.demo.modules.training.entity.QualificationItemConfig;
import com.example.demo.modules.training.mapper.PersonQualificationMapper;
import com.example.demo.modules.training.mapper.QualificationItemConfigMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class QualificationReportServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void onSubmitted_writesPdfAndFileRef() throws Exception {
        QualificationItemConfigMapper configMapper = mock(QualificationItemConfigMapper.class);
        ReportFormDefinitionMapper definitionMapper = mock(ReportFormDefinitionMapper.class);
        ReportFormSubmissionMapper submissionMapper = mock(ReportFormSubmissionMapper.class);
        ReportFormWordService wordService = mock(ReportFormWordService.class);
        DocxToPdfConverter converter = mock(DocxToPdfConverter.class);
        PersonQualificationMapper qualificationMapper = mock(PersonQualificationMapper.class);

        var cfg = new QualificationItemConfig();
        cfg.setItemKey("health_report");
        cfg.setFormId(7L);
        when(configMapper.findByFormId(7L)).thenReturn(cfg);

        var form = new ReportFormDefinition();
        form.setLayoutJson("{}");
        form.setWordTemplateIdsJson("[{\"id\":\"t1\",\"data\":\"AQID\",\"bookmarkMapping\":{}}]");
        when(definitionMapper.selectById(7L)).thenReturn(form);
        when(wordService.parseBookmarks(any())).thenReturn(List.of());
        when(wordService.suggestBookmarkMapping(any(), any())).thenReturn(Map.of());
        when(wordService.exportWord(eq(7L), eq(9L), any(), any(), any())).thenReturn(new byte[]{1, 2, 3});
        when(converter.convert(any())).thenReturn(new byte[]{'%', 'P', 'D', 'F'});

        QualificationReportService service = new QualificationReportService(
                configMapper, definitionMapper, submissionMapper, wordService, converter,
                qualificationMapper, tempDir.toString());

        service.onSubmitted(7L, 9L, "12345");

        verify(qualificationMapper).upsert(argThat(q ->
                "12345".equals(q.getPersonId())
                        && "health_report".equals(q.getItemKey())
                        && q.getState() == 0
                        && q.getFileRef() != null
                        && Files.exists(tempDir.resolve(q.getFileRef()))));
    }

    @Test
    void onSubmitted_formNotBound_doesNothing() {
        QualificationItemConfigMapper configMapper = mock(QualificationItemConfigMapper.class);
        when(configMapper.findByFormId(7L)).thenReturn(null);
        PersonQualificationMapper qualificationMapper = mock(PersonQualificationMapper.class);

        new QualificationReportService(configMapper, mock(ReportFormDefinitionMapper.class),
                mock(ReportFormSubmissionMapper.class), mock(ReportFormWordService.class),
                mock(DocxToPdfConverter.class), qualificationMapper, tempDir.toString())
                .onSubmitted(7L, 9L, "12345");

        verifyNoInteractions(qualificationMapper);
    }
}
