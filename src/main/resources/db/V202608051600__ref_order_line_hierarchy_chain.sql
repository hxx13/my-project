ALTER TABLE ref_order_line
    ADD COLUMN IF NOT EXISTS hierarchy_chain JSON NULL
    COMMENT 'Full ancestor chain from leaf to root: [{id, refType, displayName}]'
    AFTER spec_selections;
