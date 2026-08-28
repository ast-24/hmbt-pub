# データベース設計(ざっくり)

RDBを使う(MySQL系)

## テーブル設計

- users
  - id (PK)
  - created_at
  - updated_at
  - name
  - grade
  - homeclass

- users_settings
  - user_id (PK)
  - created_at
  - updated_at

- users_ui_settings
  - user_id (PK)
  - created_at
  - updated_at
  - settings // Webでしか使わないためjsonでいい

- users_identifiers_legacy
  - email (PK)
  - user_id
  - created_at
  - updated_at
  - password_hash

- users_identifiers_oidc_google
  - sub (PK)
  - user_id
  - created_at
  - updated_at
  - email
  - email_verified_as_owner
  - org

- users_identifiers_oidc_line
  - sub (PK)
  - user_id
  - created_at
  - updated_at

- verified_as_student_in_v4_oidc_line
  - sub (PK)
  - linked_email

- users_sessions
  - session_id (PK)
  - user_id
  - created_at
  - refreshed_at
  - expires_at
  - ip_address
  - user_agent

- email_verification_tokens
  - token (PK)
  - email
  - created_at
  - expires_at
  - ip_address

- original_monthly_schedules // ※これは全学年共通
  - original_monthly_schedule_day_id (PK)
  - created_at
  - updated_at // 日ごとに更新を追跡する
  - month
  - date (+monthでunique)
  - start_time
  - cafeteria_open
  - study_hall_open
  - shortened_type
  - shortened_details // これはもうjsonでいい

- original_monthly_schedule_sessions
  - original_monthly_schedule_day_id (PK)
  - grade
  - period
  - type
  - timetable_pos_dayofweek
  - timetable_pos_period
  - name
  - room_id

- original_monthly_schedule_events
  - original_monthly_schedule_day_id (PK)
  - event

- original_weekly_timetables
  - original_weekly_timetable_id (PK)
  - created_at
  - updated_at
  - grade
  - class

- original_weekly_timetable_sessions
  - original_weekly_timetable_id (PK)
  - weekday
  - period
  - course_id
  - room_id

- personal_weekly_timetables
  - personal_weekly_timetable_id (PK)
  - user_id
  - created_at
  - updated_at

- personal_weekly_timetable_sessions
  - personal_weekly_timetable_id (PK)
  - weekday
  - period
  - course_id
  - room_id

- shared_session_memos
  - shared_session_memo_id (PK)
  - month
  - date
  - period
  - course_id
  - course_name
  - room_id
  - memo

- personal_session_memos
  - personal_session_memo_id (PK)
  - user_id
  - month
  - date
  - period
  - memo
