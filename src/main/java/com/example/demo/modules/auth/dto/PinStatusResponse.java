package com.example.demo.modules.auth.dto;

import lombok.Data;

@Data
public class PinStatusResponse {
    private boolean hasPin;

    public static PinStatusResponse of(boolean hasPin) {
        PinStatusResponse r = new PinStatusResponse();
        r.setHasPin(hasPin);
        return r;
    }
}
