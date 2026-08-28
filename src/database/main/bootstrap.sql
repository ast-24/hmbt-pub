-- TiDB bootstrap DDL for hmbt-v5

CREATE DATABASE IF NOT EXISTS hmbt_v5
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_bin;

USE hmbt_v5;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(23) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  name VARCHAR(255) NULL,
  grade TINYINT UNSIGNED NULL,
  home_class TINYINT UNSIGNED NULL,
  is_verified_as_student BOOLEAN NOT NULL DEFAULT FALSE,
  has_any_timetable_selection BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (id),
  CONSTRAINT chk_users_grade CHECK (grade IS NULL OR grade BETWEEN 1 AND 3),
  CONSTRAINT chk_users_home_class CHECK (home_class IS NULL OR home_class BETWEEN 1 AND 6)
);

CREATE TABLE IF NOT EXISTS users_settings (
  user_id CHAR(23) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  settings JSON NOT NULL,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_users_settings_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS users_ui_settings (
  user_id CHAR(23) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  settings JSON NOT NULL,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_users_ui_settings_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS users_identifiers_legacy (
  email VARCHAR(255) NOT NULL,
  user_id CHAR(23) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  password_hash VARCHAR(255) NOT NULL,
  PRIMARY KEY (email),
  KEY idx_users_identifiers_legacy_user_id (user_id),
  CONSTRAINT fk_users_identifiers_legacy_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS users_identifiers_oidc_google (
  sub VARCHAR(255) NOT NULL,
  user_id CHAR(23) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  email VARCHAR(255) NULL,
  email_verified_as_owner BOOLEAN NOT NULL DEFAULT FALSE,
  org VARCHAR(255) NULL,
  PRIMARY KEY (sub),
  KEY idx_users_identifiers_oidc_google_user_id (user_id),
  CONSTRAINT fk_users_identifiers_oidc_google_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS users_identifiers_oidc_line (
  sub VARCHAR(255) NOT NULL,
  user_id CHAR(23) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (sub),
  KEY idx_users_identifiers_oidc_line_user_id (user_id),
  CONSTRAINT fk_users_identifiers_oidc_line_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS verified_as_student_in_v4_oidc_line (
  sub VARCHAR(255) NOT NULL,
  linked_email VARCHAR(255) NULL,
  PRIMARY KEY (sub)
);

CREATE TABLE IF NOT EXISTS users_sessions (
  session_id CHAR(32) NOT NULL,
  user_id CHAR(23) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  refreshed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  secret CHAR(64) NOT NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(1024) NULL,
  PRIMARY KEY (session_id),
  KEY idx_users_sessions_user_id_expires_at (user_id, expires_at),
  KEY idx_users_sessions_expires_at (expires_at),
  CONSTRAINT fk_users_sessions_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token CHAR(8) NOT NULL,
  email VARCHAR(255) NOT NULL,
  is_linking BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  ip_address VARCHAR(45) NULL,
  PRIMARY KEY (token),
  KEY idx_email_verification_tokens_email_expires_at (email, expires_at),
  KEY idx_email_verification_tokens_expires_at (expires_at)
);

CREATE TABLE IF NOT EXISTS email_verification_request_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL,
  ip_address VARCHAR(45) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_email_verification_request_logs_email_created_at (email, created_at),
  KEY idx_email_verification_request_logs_ip_created_at (ip_address, created_at)
);

CREATE TABLE IF NOT EXISTS legacy_login_failures (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL,
  ip_address VARCHAR(45) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_legacy_login_failures_email_created_at (email, created_at),
  KEY idx_legacy_login_failures_ip_created_at (ip_address, created_at)
);

CREATE TABLE IF NOT EXISTS original_monthly_schedule_days (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  target_date DATE NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  start_time TIME NULL,
  cafeteria_open BOOLEAN NULL,
  study_hall_open BOOLEAN NULL,
  shortened_type ENUM('common', 'special', 'unknown') NOT NULL,
  shortened_details JSON NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_original_monthly_schedule_days_target_date (target_date)
);

CREATE TABLE IF NOT EXISTS original_monthly_schedule_sessions (
  schedule_day_id BIGINT UNSIGNED NOT NULL,
  grade TINYINT UNSIGNED NOT NULL,
  period SMALLINT UNSIGNED NOT NULL,
  session_type ENUM('normal', 'special') NOT NULL,
  timetable_pos_dayofweek TINYINT UNSIGNED NULL,
  timetable_pos_period SMALLINT UNSIGNED NULL,
  special_name VARCHAR(255) NULL,
  room_id VARCHAR(64) NULL,
  PRIMARY KEY (schedule_day_id, grade, period),
  KEY idx_original_monthly_schedule_sessions_grade_period (grade, period),
  CONSTRAINT fk_original_monthly_schedule_sessions_day
    FOREIGN KEY (schedule_day_id) REFERENCES original_monthly_schedule_days (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT chk_original_monthly_schedule_sessions_grade CHECK (grade BETWEEN 1 AND 3),
  CONSTRAINT chk_original_monthly_schedule_sessions_period CHECK (period BETWEEN 1 AND 31),
  CONSTRAINT chk_original_monthly_schedule_sessions_weekday CHECK (
    timetable_pos_dayofweek IS NULL OR timetable_pos_dayofweek BETWEEN 0 AND 6
  ),
  CONSTRAINT chk_original_monthly_schedule_sessions_payload CHECK (
    (
      session_type = 'normal'
      AND timetable_pos_dayofweek IS NOT NULL
      AND timetable_pos_period IS NOT NULL
      AND special_name IS NULL
    )
    OR
    (
      session_type = 'special'
      AND timetable_pos_dayofweek IS NULL
      AND timetable_pos_period IS NULL
      AND special_name IS NOT NULL
    )
  )
);

CREATE TABLE IF NOT EXISTS original_monthly_schedule_events (
  schedule_day_id BIGINT UNSIGNED NOT NULL,
  event_order SMALLINT UNSIGNED NOT NULL,
  event_text VARCHAR(255) NOT NULL,
  PRIMARY KEY (schedule_day_id, event_order),
  CONSTRAINT fk_original_monthly_schedule_events_day
    FOREIGN KEY (schedule_day_id) REFERENCES original_monthly_schedule_days (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS original_weekly_timetables (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  grade TINYINT UNSIGNED NOT NULL,
  home_class TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_original_weekly_timetables_grade_home_class (grade, home_class),
  CONSTRAINT chk_original_weekly_timetables_home_class CHECK (home_class BETWEEN 1 AND 6),
  CONSTRAINT chk_original_weekly_timetables_grade CHECK (grade BETWEEN 1 AND 3)
);

CREATE TABLE IF NOT EXISTS original_weekly_timetable_sessions (
  original_weekly_timetable_id BIGINT UNSIGNED NOT NULL,
  weekday TINYINT UNSIGNED NOT NULL,
  period SMALLINT UNSIGNED NOT NULL,
  session_type ENUM('normal', 'select') NOT NULL,
  course_id VARCHAR(64) NULL,
  selection_id CHAR(1) NULL,
  PRIMARY KEY (original_weekly_timetable_id, weekday, period),
  KEY idx_original_weekly_timetable_sessions_weekday_period (weekday, period),
  CONSTRAINT fk_original_weekly_timetable_sessions_timetable
    FOREIGN KEY (original_weekly_timetable_id) REFERENCES original_weekly_timetables (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT chk_original_weekly_timetable_sessions_weekday CHECK (weekday BETWEEN 0 AND 6),
  CONSTRAINT chk_original_weekly_timetable_sessions_period CHECK (period BETWEEN 1 AND 31),
  CONSTRAINT chk_original_weekly_timetable_sessions_selection_id CHECK (
    selection_id IS NULL OR selection_id IN ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J')
  ),
  CONSTRAINT chk_original_weekly_timetable_sessions_shape CHECK (
    (
      session_type = 'normal'
      AND course_id IS NOT NULL
      AND selection_id IS NULL
    )
    OR (
      session_type = 'select'
      AND course_id IS NULL
      AND selection_id IS NOT NULL
    )
  )
);

CREATE TABLE IF NOT EXISTS original_weekly_timetable_session_rooms (
  original_weekly_timetable_id BIGINT UNSIGNED NOT NULL,
  weekday TINYINT UNSIGNED NOT NULL,
  period SMALLINT UNSIGNED NOT NULL,
  room_order SMALLINT UNSIGNED NOT NULL,
  room_id VARCHAR(64) NOT NULL,
  PRIMARY KEY (original_weekly_timetable_id, weekday, period, room_order),
  UNIQUE KEY uq_original_weekly_timetable_session_rooms_room (
    original_weekly_timetable_id,
    weekday,
    period,
    room_id
  ),
  CONSTRAINT fk_original_weekly_timetable_session_rooms_session
    FOREIGN KEY (original_weekly_timetable_id, weekday, period)
    REFERENCES original_weekly_timetable_sessions (original_weekly_timetable_id, weekday, period)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS personal_weekly_timetables (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id CHAR(23) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_personal_weekly_timetables_user_id (user_id),
  CONSTRAINT fk_personal_weekly_timetables_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS personal_weekly_timetable_selections (
  personal_weekly_timetable_id BIGINT UNSIGNED NOT NULL,
  selection_id CHAR(1) NOT NULL,
  course_id VARCHAR(64) NOT NULL,
  room_id VARCHAR(64) NULL,
  PRIMARY KEY (personal_weekly_timetable_id, selection_id),
  KEY idx_personal_weekly_timetable_selections_selection_id (selection_id),
  CONSTRAINT fk_personal_weekly_timetable_selections_timetable
    FOREIGN KEY (personal_weekly_timetable_id) REFERENCES personal_weekly_timetables (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT chk_personal_weekly_timetable_selections_selection_id CHECK (
    selection_id IN ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J')
  )
);

CREATE TABLE IF NOT EXISTS shared_session_memos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  memo_date DATE NOT NULL,
  period SMALLINT UNSIGNED NOT NULL,
  target_type ENUM('course', 'special_name') NOT NULL,
  target_id VARCHAR(255) NOT NULL,
  room_id VARCHAR(64) NOT NULL DEFAULT '',
  memo TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_shared_session_memos_lookup (
    memo_date,
    period,
    target_type,
    target_id,
    room_id
  ),
  KEY idx_shared_session_memos_date_period (memo_date, period),
  CONSTRAINT chk_shared_session_memos_period CHECK (period BETWEEN 1 AND 31)
);

CREATE TABLE IF NOT EXISTS personal_session_memos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id CHAR(23) NOT NULL,
  memo_date DATE NOT NULL,
  period SMALLINT UNSIGNED NOT NULL,
  memo TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_personal_session_memos_user_date_period (user_id, memo_date, period),
  KEY idx_personal_session_memos_user_date (user_id, memo_date),
  CONSTRAINT fk_personal_session_memos_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT chk_personal_session_memos_period CHECK (period BETWEEN 1 AND 31)
);

CREATE TABLE IF NOT EXISTS personal_daily_memos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id CHAR(23) NOT NULL,
  memo_date DATE NOT NULL,
  memo TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_personal_daily_memos_user_date (user_id, memo_date),
  KEY idx_personal_daily_memos_user_date (user_id, memo_date),
  CONSTRAINT fk_personal_daily_memos_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS user_ical_feeds (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_user_id CHAR(23) NOT NULL,
  format_type ENUM(
    'personal_sessions',
    'personal_full_day'
  ) NOT NULL,
  calendar_name VARCHAR(255) NOT NULL,
  title_template VARCHAR(255) NULL,
  description_template TEXT NULL,
  options_json JSON NULL,
  public_path VARCHAR(255) NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_generated_at DATETIME(3) NULL,
  generation_error TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_ical_feeds_public_path (public_path),
  KEY idx_user_ical_feeds_owner_user_id (owner_user_id),
  KEY idx_user_ical_feeds_batch (is_enabled, last_generated_at, updated_at),
  CONSTRAINT fk_user_ical_feeds_owner_user
    FOREIGN KEY (owner_user_id) REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS grade_ical_feeds (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  target_grade TINYINT UNSIGNED NOT NULL,
  format_type ENUM(
    'grade_full_day',
    'grade_school_day',
    'grade_afternoon_day',
    'grade_events'
  ) NOT NULL,
  calendar_name VARCHAR(255) NOT NULL,
  title_template VARCHAR(255) NULL,
  description_template TEXT NULL,
  options_json JSON NULL,
  public_path VARCHAR(255) NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_generated_at DATETIME(3) NULL,
  generation_error TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_grade_ical_feeds_public_path (public_path),
  UNIQUE KEY uq_grade_ical_feeds_grade_format (target_grade, format_type),
  KEY idx_grade_ical_feeds_target_grade (target_grade),
  KEY idx_grade_ical_feeds_batch (is_enabled, last_generated_at, updated_at),
  CONSTRAINT chk_grade_ical_feeds_target_grade CHECK (
    target_grade BETWEEN 1 AND 3
  )
);

CREATE TABLE IF NOT EXISTS grade_ical_feed_subscribers (
  feed_id BIGINT UNSIGNED NOT NULL,
  user_id CHAR(23) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (feed_id, user_id),
  KEY idx_grade_ical_feed_subscribers_user_id (user_id),
  CONSTRAINT fk_grade_ical_feed_subscribers_feed
    FOREIGN KEY (feed_id) REFERENCES grade_ical_feeds (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_grade_ical_feed_subscribers_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS global_cafemenu_days (
  target_date DATE NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  menus_as_str JSON NULL,
  menus_as_img_url VARCHAR(1024) NULL,
  menus_as_img_preview_url VARCHAR(1024) NULL,
  PRIMARY KEY (target_date)
);

CREATE TABLE IF NOT EXISTS train_timetables (
  timetable_id VARCHAR(128) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  payload_json JSON NOT NULL,
  PRIMARY KEY (timetable_id)
);
