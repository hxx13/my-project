package com.example.demo.modules.aro.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonAlias;
import lombok.Data;
import java.util.List;
import java.util.stream.Collectors;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class AroPersonnel {
    // 1. 核心身份锚点
    @JsonAlias({"id", "userId", "user_id"})
    private String id;
    private String name;
    @JsonAlias({"jobNumber", "job_number"})
    private String jobNumber;
    @JsonAlias({"idNumber", "id_number"})
    private String idNumber;

    // 2. 基础画像
    private String head;
    private Integer gender;
    @JsonAlias({"totalExp", "total_exp"})
    private Integer totalExp;
    @JsonAlias({"mobilePhone", "mobile_phone"})
    private String mobilePhone;
    private String email;

    // 3. 组织与权限
    @JsonAlias({"departmentName", "department_name"})
    private String departmentName;

    // 💥 官方外层的空字符串占位符
    @JsonAlias({"projectGroupName", "project_group_name"})
    private String projectGroupName;

    // 💥💥 核心修复：用来接住官方真实数据的数组！
    private List<ProjectGroupVo> projectGroups;

    @JsonAlias({"userTypeNames", "userTypeName", "user_type_names"})
    private String userTypeNames;
    @JsonAlias({"userClassName", "user_class_name"})
    private String userClassName;
    @JsonAlias({"isSchool", "is_school"})
    private Integer isSchool;

    // 4. 状态
    private Integer state;

    // 5. 权限拓展
    @JsonAlias({"joinRoomName", "join_room_name"})
    private String joinRoomName;
    @JsonAlias({"allowedRoomsJson", "allowed_rooms_json"})
    private String allowedRoomsJson;

    /** 官方可进房间映射后的可读文案（浦东/浦西 + 房间名），由同步任务写入 */
    @JsonAlias({"allowedRoomsDisplayZh", "allowed_rooms_display_zh"})
    private String allowedRoomsDisplayZh;

    /** 1=有官方可进房间（展示或 JSON 非空），0=无；与库列一致，供列表排序 */
    @JsonAlias({"hasOfficialRoomPermission", "has_official_room_permission"})
    private Integer hasOfficialRoomPermission;

    // 💥 官方文档中定义的内部结构体
    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ProjectGroupVo {
        private String projectGroupName; // 真实的课题组名在这里面
    }

    // 💥 智能提取器：供数据库 Service 调用，优先从数组里榨取真实名字！
    public String getResolvedProjectGroupNames() {
        // 如果数组里有数据，提取出来并用逗号拼接（防一个人有多个课题组）
        if (this.projectGroups != null && !this.projectGroups.isEmpty()) {
            return this.projectGroups.stream()
                    .map(ProjectGroupVo::getProjectGroupName)
                    .filter(g -> g != null && !g.trim().isEmpty())
                    .collect(Collectors.joining(", "));
        }
        // 兜底返回外层的字符串
        return this.projectGroupName != null ? this.projectGroupName : "";
    }
}