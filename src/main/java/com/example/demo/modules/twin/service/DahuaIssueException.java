package com.example.demo.modules.twin.service;

import com.example.demo.modules.twin.dto.DahuaIssueCardResponse;

public class DahuaIssueException extends RuntimeException {
    private final DahuaIssueCardResponse response;

    public DahuaIssueException(String message, DahuaIssueCardResponse response) {
        super(message);
        this.response = response;
    }

    public DahuaIssueCardResponse getResponse() {
        return response;
    }
}
