-- 扩展 twin_violation_rule 表，增加笼架联动规则字段
ALTER TABLE twin_violation_rule
  ADD COLUMN IF NOT EXISTS cage_status_codes      JSON          COMMENT '监控的特殊状态类型 ["HEALTH_ABNORMAL","NEED_DIVIDE"]',
  ADD COLUMN IF NOT EXISTS cage_delay_days        INT           COMMENT '延迟天数',
  ADD COLUMN IF NOT EXISTS cage_judge_mode        VARCHAR(20)   DEFAULT 'AUTO_SYNC_LINKED' COMMENT '判定模式: AUTO_SYNC_LINKED / PURE_DAYS / PURE_MANUAL',
  ADD COLUMN IF NOT EXISTS cage_manual_trigger    TINYINT(1)    DEFAULT 0 COMMENT '手动执行也触发判定',
  ADD COLUMN IF NOT EXISTS cage_area_filter       JSON          COMMENT '区域筛选 {"campuses":[],"rooms":[]}',
  ADD COLUMN IF NOT EXISTS cage_group_whitelist   JSON          COMMENT '课题组白名单',
  ADD COLUMN IF NOT EXISTS cage_trigger_action    VARCHAR(20)   DEFAULT 'BOTH' COMMENT '触发动作: VIOLATION_ONLY / NOTICE_ONLY / BOTH',
  ADD COLUMN IF NOT EXISTS cage_image_urls        JSON          COMMENT '违规图片URL列表';
