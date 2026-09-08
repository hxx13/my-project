-- 培训场次循环：每周的星期几 + 每天的起始时刻（recurrence = WEEKLY/DAILY）
ALTER TABLE training ADD COLUMN recurrence_day INT NULL COMMENT 'WEEKLY 时：1=周一 .. 7=周日';
ALTER TABLE training ADD COLUMN recurrence_time VARCHAR(8) NULL COMMENT 'HH:mm 起始时刻';
