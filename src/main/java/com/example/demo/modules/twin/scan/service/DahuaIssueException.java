package com.example.demo.modules.twin.scan.service;

import com.example.demo.modules.twin.scan.dto.DahuaIssueCardResponse;

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
