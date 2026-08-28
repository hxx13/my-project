package com.example.demo.modules.twin.dashboard.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 主页大屏「提醒公示」单条 DTO。
 * summary 为纯文本摘要；imageUrls 为展示图片（正文 &lt;img&gt; 提取 + 旧记录 imageUrls 列合并，兼容历史）。
 * 笼架联动课题组违规：groupName/members 有值，前端渲染为「组卡 + 全员名字」。
 */
@Data
public class DashboardViolationBoardItemDTO {
    private Long id;
    private String displayName;
    /** 课题组名（仅笼架联动批量违规时有值，前端以此区分单人/课题组渲染） */
    private String groupName;
    /** 组卡成员名单（仅 groupName 非空时有值） */
    private List<MemberDTO> members;
    /** 状态标签（组卡渲染彩色标签；个人违规为 null） */
    private String statusLabel;
    private String summary;
    /** 展示图片列表（正文图片 + 旧记录单独上传图片） */
    private List<String> imageUrls;
    private LocalDateTime createdAt;

    @Data
    public static class MemberDTO {
        private String name;
    }
}
