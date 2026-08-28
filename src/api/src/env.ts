function readRequired(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readOptional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

function readNumber(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) {
    return defaultValue;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) {
    throw new Error(`Environment variable ${name} must be a number`);
  }
  return value;
}

export interface RuntimeEnv {
  database_url?: string;
  database_host?: string;
  database_port: number;
  database_user?: string;
  database_password?: string;
  database_name?: string;

  jwt_private_key: string;
  jwt_public_key: string;

  google_oidc_client_id?: string;
  google_oidc_client_secret?: string;

  line_oidc_client_id?: string;
  line_oidc_client_secret?: string;
  line_bot_url?: string;

  email_from?: string;

  zoho_accounts_base_url: string;
  zoho_mail_base_url: string;
  zoho_oauth_client_id?: string;
  zoho_oauth_client_secret?: string;
  zoho_oauth_refresh_token?: string;
  zoho_account_id?: string;

  cafe_menu_r2_endpoint?: string;
  cafe_menu_r2_access_key_id?: string;
  cafe_menu_r2_secret_access_key?: string;
  cafe_menu_r2_bucket_name?: string;
  cafe_menu_r2_base_bucket_url?: string;

  ical_r2_endpoint?: string;
  ical_r2_access_key_id?: string;
  ical_r2_secret_access_key?: string;
  ical_r2_bucket_name?: string;
  ical_r2_base_bucket_url?: string;

  ical_gen_queue_url?: string;
  monthly_schedule_update_queue_url?: string;
  admin_messenger_url?: string;

  audit_cloudwatch_log_group?: string;
  audit_cloudwatch_region?: string;
}

export interface LoadRuntimeEnvOptions {
  require_jwt_keys?: boolean;
}

export function loadRuntimeEnv(
  options: LoadRuntimeEnvOptions = {},
): RuntimeEnv {
  const requireJwtKeys = options.require_jwt_keys ?? true;

  return {
    database_url: readOptional("DATABASE_URL"),
    database_host: readOptional("DATABASE_HOST"),
    database_port: readNumber("DATABASE_PORT", 4000),
    database_user: readOptional("DATABASE_USER"),
    database_password: readOptional("DATABASE_PASSWORD"),
    database_name: readOptional("DATABASE_NAME"),

    jwt_private_key: requireJwtKeys
      ? readRequired("JWT_PRIVATE_KEY")
      : (readOptional("JWT_PRIVATE_KEY") ?? ""),
    jwt_public_key: requireJwtKeys
      ? readRequired("JWT_PUBLIC_KEY")
      : (readOptional("JWT_PUBLIC_KEY") ?? ""),

    google_oidc_client_id: readOptional("GOOGLE_OIDC_CLIENT_ID"),
    google_oidc_client_secret: readOptional("GOOGLE_OIDC_CLIENT_SECRET"),

    line_oidc_client_id: readOptional("LINE_OIDC_CLIENT_ID"),
    line_oidc_client_secret: readOptional("LINE_OIDC_CLIENT_SECRET"),
    line_bot_url: readOptional("LINE_BOT_URL"),

    email_from: readOptional("EMAIL_FROM"),

    zoho_accounts_base_url:
      readOptional("ZOHO_ACCOUNTS_BASE_URL") ?? "https://accounts.zoho.jp",
    zoho_mail_base_url:
      readOptional("ZOHO_MAIL_BASE_URL") ?? "https://mail.zoho.jp",
    zoho_oauth_client_id: readOptional("ZOHO_OAUTH_CLIENT_ID"),
    zoho_oauth_client_secret: readOptional("ZOHO_OAUTH_CLIENT_SECRET"),
    zoho_oauth_refresh_token: readOptional("ZOHO_OAUTH_REFRESH_TOKEN"),
    zoho_account_id: readOptional("ZOHO_ACCOUNT_ID"),

    cafe_menu_r2_endpoint: readOptional("CAFE_MENU_R2_ENDPOINT"),
    cafe_menu_r2_access_key_id: readOptional("CAFE_MENU_R2_ACCESS_KEY_ID"),
    cafe_menu_r2_secret_access_key: readOptional(
      "CAFE_MENU_R2_SECRET_ACCESS_KEY",
    ),
    cafe_menu_r2_bucket_name: readOptional("CAFE_MENU_R2_BUCKET_NAME"),
    cafe_menu_r2_base_bucket_url: readOptional("CAFE_MENU_R2_BASE_BUCKET_URL"),

    ical_r2_endpoint: readOptional("ICAL_R2_ENDPOINT"),
    ical_r2_access_key_id: readOptional("ICAL_R2_ACCESS_KEY_ID"),
    ical_r2_secret_access_key: readOptional("ICAL_R2_SECRET_ACCESS_KEY"),
    ical_r2_bucket_name: readOptional("ICAL_R2_BUCKET_NAME"),
    ical_r2_base_bucket_url: readOptional("ICAL_R2_BASE_BUCKET_URL"),

    ical_gen_queue_url: readOptional("ICAL_GEN_QUEUE_URL"),
    monthly_schedule_update_queue_url: readOptional(
      "MONTHLY_SCHEDULE_UPDATE_QUEUE_URL",
    ),
    admin_messenger_url: readOptional("ADMIN_MESSENGER_URL"),

    audit_cloudwatch_log_group: readOptional("AUDIT_CLOUDWATCH_LOG_GROUP"),
    audit_cloudwatch_region: readOptional("AUDIT_CLOUDWATCH_REGION"),
  };
}
