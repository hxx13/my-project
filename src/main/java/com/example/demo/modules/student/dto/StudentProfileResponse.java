package com.example.demo.modules.student.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

@Data
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public class StudentProfileResponse {

    private StudentProfileAccountInfo account;
    private StudentProfilePersonnelInfo personnel;
    private StudentProfileStatsInfo stats;

    public static StudentProfileResponse empty() {
        StudentProfileResponse resp = new StudentProfileResponse();
        resp.setStats(new StudentProfileStatsInfo());
        return resp;
    }
}
