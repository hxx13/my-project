package com.example.demo.common.exception;

/**
 * 业务错误码（与 HTTP 状态解耦，放在 Result.code）。
 * 分段：1-模块-子码，便于检索；新增模块请在本类追加常量。
 */
public final class ErrorCodeConstants {

    private ErrorCodeConstants() {
    }

    /** 通用 */
    public static final int BAD_REQUEST = 400;
    public static final int UNAUTHORIZED = 401;
    public static final int FORBIDDEN = 403;
    public static final int NOT_FOUND = 404;
    public static final int INTERNAL_ERROR = 500;

    /** 认证 auth 1-001-xxx */
    public static final int AUTH_LOGIN_FAILED = 1_001_001;
    public static final int AUTH_TOKEN_INVALID = 1_001_002;

    /** 孪生 twin 1-002-xxx */
    public static final int TWIN_JOB_NOT_FOUND = 1_002_001;
    public static final int TWIN_SCAN_WINDOW_DENIED = 1_002_002;

    /** 特殊通道 special-channel 1-004-xxx */
    public static final int SPECIAL_CHANNEL_PIN_ALREADY_SET  = 1_004_001;  // "已设置过个人密码"
    public static final int SPECIAL_CHANNEL_PIN_NOT_SET       = 1_004_002;  // "请先设置个人密码"
    public static final int SPECIAL_CHANNEL_PIN_INVALID       = 1_004_003;  // "个人密码错误"
    public static final int SPECIAL_CHANNEL_PIN_FORMAT        = 1_004_004;  // "密码为6-8位纯数字"
    public static final int SPECIAL_CHANNEL_USER_NOT_FOUND    = 1_004_005;  // "未在人员库中找到该学号"
    public static final int SPECIAL_CHANNEL_PIN_LOCKED        = 1_004_006;  // "密码已锁定，请稍后重试"
    public static final int SPECIAL_CHANNEL_ACCOUNT_DISABLED  = 1_004_007;  // "账号已禁用"

    /** 知识库 knowledge 1-005-xxx */
    public static final int KNOWLEDGE_CATEGORY_NOT_FOUND   = 1_005_001;  // "知识库分类不存在"
    public static final int KNOWLEDGE_CATEGORY_DUPLICATE   = 1_005_002;  // "分类标识已存在"
    public static final int KNOWLEDGE_CATEGORY_NOT_EMPTY   = 1_005_003;  // "分类下存在文档，无法删除"
    public static final int KNOWLEDGE_PAGE_NOT_FOUND       = 1_005_004;  // "文档页面不存在"
    public static final int KNOWLEDGE_SLUG_DUPLICATE       = 1_005_005;  // "该分类下已存在相同标识的文档"
    public static final int KNOWLEDGE_IMPORT_PARSE_ERROR   = 1_005_006;  // "文档导入解析失败"
    public static final int KNOWLEDGE_VERSION_CONFLICT     = 1_005_007;  // "文档已被他人修改，请刷新后重试"

    // Upload 1-007-xxx
    public static final int UPLOAD_FILE_NOT_FOUND = 1_007_001;
    public static final int UPLOAD_SYNC_SECRET_INVALID = 1_007_002;

    /** 填报报表 report-form 1-008-xxx */
    public static final int REPORT_FORM_NOT_FOUND = 1_008_001;
    public static final int REPORT_FORM_NOT_PUBLISHED = 1_008_002;
    public static final int REPORT_FORM_VERSION_CONFLICT = 1_008_003;
    public static final int REPORT_FORM_OUT_OF_WINDOW = 1_008_004;
    public static final int REPORT_FORM_FIELD_REQUIRED = 1_008_005;
    public static final int REPORT_FORM_FIELD_INVALID = 1_008_006;
    public static final int REPORT_FORM_NO_PERMISSION = 1_008_007;
    public static final int REPORT_FORM_FIELD_NO_PERMISSION = 1_008_008;
    public static final int REPORT_FORM_OPTION_SET_IN_USE = 1_008_009;
    public static final int REPORT_FORM_WORD_TEMPLATE_NOT_FOUND = 1_008_010;

    /** 手机端直达 mobile-token 1-010-xxx */
    public static final int MOBILE_TOKEN_INVALID   = 1_010_001;  // "链接无效或已失效"
    public static final int MOBILE_TOKEN_EXPIRED   = 1_010_002;  // "链接已过期"
    public static final int MOBILE_TOKEN_MULTI_IP  = 1_010_003;  // "检测到多设备使用"

    /** 人脸识别 face 1-009-xxx */
    public static final int FACE_VERIFY_NO_BASELINE = 1_009_001;
    public static final int FACE_VERIFY_NO_FACE = 1_009_002;
    public static final int FACE_MODEL_NOT_READY = 1_009_003;
    public static final int FACE_VERIFY_TOKEN_INVALID = 1_009_004;
    public static final int FACE_BASELINE_NO_FACE = 1_009_005;

    /** ARO 出站 aro 1-003-xxx */
    public static final int ARO_TOKEN_REQUIRED = 1_003_003;

    /** 物资 material 1-006-xxx */
    public static final int MATERIAL_SPEC_REQUIRED = 1_006_001;
    public static final int MATERIAL_SPEC_INVALID_JSON = 1_006_002;
    public static final int MATERIAL_MERGE_STATUS_CONFLICT = 1_006_003;  // "申领单状态已变更，合并失败"

    /** 外部推送 notify-push 1-011-xxx */
    public static final int NOTIFY_SOURCE_NOT_FOUND    = 1_011_001;
    public static final int NOTIFY_CHANNEL_DISABLED    = 1_011_002;
    public static final int NOTIFY_BINDING_NOT_FOUND   = 1_011_003;
    public static final int NOTIFY_BINDING_UNVERIFIED  = 1_011_004;
    public static final int NOTIFY_SEND_FAILED         = 1_011_005;
    public static final int NOTIFY_VERIFY_CODE_INVALID = 1_011_006;
    public static final int NOTIFY_BINDING_DUPLICATE   = 1_011_007;

    // ============ AGV 模块 ============
    public static final int AGV_ROBOT_UNREACHABLE    = 1_012_001; // 单台小车不可达
    public static final int AGV_SERVER_UNREACHABLE   = 1_012_002; // 上位机不可达
    public static final int AGV_TRAJECTORY_NOT_FOUND = 1_012_003; // 轨迹数据未找到

    /** AGV 分析 agv-analysis 1-012-xxx */
    public static final int AGV_ZONE_NOT_FOUND = 1_012_004;
    public static final int AGV_RULE_NOT_FOUND = 1_012_005;
    public static final int AGV_SEGMENT_NOT_FOUND = 1_012_006;
    public static final int AGV_ANALYSIS_NO_DATA = 1_012_007;

    /** AGV 统计管道 agv-stats 1-012-xxx */
    public static final int AGV_STATS_CONFIG_NOT_FOUND = 1_012_008;
    public static final int AGV_STATS_PIPE_NOT_FOUND    = 1_012_009;
    public static final int AGV_STATS_INVALID_CONFIG    = 1_012_010;

    /** 动物订购 animal-order 1-013-xxx */
    public static final int ANIMAL_ORDER_WINDOW_CLOSED        = 1_013_001; // 当前不在可购时间窗口内
    public static final int ANIMAL_ORDER_WINDOW_CONFLICT      = 1_013_002; // 时间窗口配置异常
    public static final int ANIMAL_ORDER_WINDOW_RULE_CONFLICT = 1_013_003; // 相反效果重叠时间段
    public static final int ANIMAL_ORDER_ETA_POLICY_INVALID   = 1_013_004; // 固定送达日未配置
}
