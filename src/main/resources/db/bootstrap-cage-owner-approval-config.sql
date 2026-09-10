-- 所属人审核配置：把「到位确认 / 分笼审核 / 转移审核」三个开关从全局配置改为按「所属人」持久化。
-- 判定口径：学生提交的分笼/转移看目标所属人（源笼位占用者）的配置；认领/代认领看接收人的配置。
-- 无行 = 三个开关全部 true（默认需要审核）。
-- 幂等：CREATE TABLE IF NOT EXISTS。
CREATE TABLE IF NOT EXISTS cage_owner_approval_config (
    id                         BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    owner_account_id           VARCHAR(64) NOT NULL COMMENT '所属人账号 id（canonical：STAFF_ 已展开成 ARO 编号）',
    confirm_required           TINYINT(1)  NOT NULL DEFAULT 1 COMMENT '1=审核通过后仍需到场扫码确认',
    divide_approval_required   TINYINT(1)  NOT NULL DEFAULT 1 COMMENT '1=分笼需审核',
    transfer_approval_required TINYINT(1)  NOT NULL DEFAULT 1 COMMENT '1=转移笼位需审核',
    update_by                  VARCHAR(64) NULL COMMENT '最后修改人账号 id',
    update_time                DATETIME    NULL,
    created_at                 DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_cage_owner_approval (owner_account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='所属人审核配置（到位确认/分笼审核/转移审核）';
