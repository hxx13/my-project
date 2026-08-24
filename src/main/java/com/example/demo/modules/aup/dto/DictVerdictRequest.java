package com.example.demo.modules.aup.dto;

import lombok.Data;

/** 逐项校对四态请求（POST /api/aup-dict/{dictKey}/items/{itemId}/verdict）。 */
@Data
public class DictVerdictRequest {
    /** CONFIRM / MODIFY / DELETE / QUESTION */
    private String verdict;
    private String verdictNote;
}
