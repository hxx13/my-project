-- 转移单支持多组源→目标（一次审核）：cage_op_request 增 pairs JSON 列，形如 [{"source":...,"target":...}]
ALTER TABLE cage_op_request ADD COLUMN pairs JSON NULL COMMENT '一组源→目标对，形如 [{"source":...,"target":...}]';
