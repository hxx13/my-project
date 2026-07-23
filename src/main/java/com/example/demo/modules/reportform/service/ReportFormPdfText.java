package com.example.demo.modules.reportform.service;

/** PDF 文本清理（SimHei 缺字过滤） */
final class ReportFormPdfText {

    private ReportFormPdfText() {}

    /** 保留空格与换行，仅去掉字体不支持的字符 */
    static String sanitize(String text) {
        if (text == null) return "";
        StringBuilder sb = new StringBuilder(text.length());
        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);
            if (ch == '\r' || ch == '\t') {
                sb.append(' ');
                continue;
            }
            if (ch == '\u2713' || ch == '\u2714' || ch == '\u2717' || ch == '\u2718') {
                continue;
            }
            if (ch < 0x20 && ch != '\n') continue;
            sb.append(ch);
        }
        return sb.toString();
    }

    /** 单行展示用（去掉首尾空白） */
    static String safe(String text) {
        return sanitize(text).trim();
    }
}
