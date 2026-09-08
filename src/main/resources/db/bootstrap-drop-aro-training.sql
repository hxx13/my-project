-- 丢弃旧的 ARO 培训缓存表（幂等，数据可从 ARO 接口重新拉取）
DROP TABLE IF EXISTS aro_training_trainee;
DROP TABLE IF EXISTS aro_training_session;
DROP TABLE IF EXISTS aro_training_favorite;
