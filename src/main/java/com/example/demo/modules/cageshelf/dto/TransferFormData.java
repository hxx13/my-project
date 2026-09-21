package com.example.demo.modules.cageshelf.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/** 学生在转移单弹窗里填/改的值。自动值不落库（可重算），只有人工改过的进这里。 */
@Data
public class TransferFormData {

    /** 拟定转移日期（学生填）。 */
    private String transferDate;
    /** 申请方单位名称；为空则用笼位表单里的部门/课题组。 */
    private String unitName;
    /** 电话；为空则用申请人账号的 mobile_phone。 */
    private String phone;
    /** 每个目标笼位一行，序号与目标笼位列表对应。 */
    private List<Row> rows = new ArrayList<>();

    @Data
    public static class Row {
        /** 品系；为空则用源笼位的品系名。 */
        private String strain;
        /** 雌数；null 则用源笼位的值。 */
        private Integer female;
        /** 雄数；null 则用源笼位的值。 */
        private Integer male;

        public Row() {
        }

        public Row(String strain, Integer female, Integer male) {
            this.strain = strain;
            this.female = female;
            this.male = male;
        }
    }
}
