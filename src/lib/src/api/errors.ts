export enum CommonApiErrorCode {
  Unauthorized = "UNAUTHORIZED",
  Forbidden = "FORBIDDEN",
  NoAccessToken = "NO_ACCESS_TOKEN",
  NotVerifiedStudent = "NOT_VERIFIED_STUDENT",
  ResourceNotFound = "RESOURCE_NOT_FOUND",
  InvalidRequest = "INVALID_REQUEST",
  InvalidJsonBody = "INVALID_JSON_BODY",
  MissingPathParameter = "MISSING_PATH_PARAMETER",
  ServiceUnavailable = "SERVICE_UNAVAILABLE",
  InternalServerError = "INTERNAL_SERVER_ERROR",
}

export enum AuthUserLegacyStartErrorCode {
  MissingEmailOrPassword = "AUTH_LEGACY_START_MISSING_EMAIL_OR_PASSWORD",
  InvalidEmailFormat = "AUTH_LEGACY_START_INVALID_EMAIL_FORMAT",
  InvalidPasswordFormat = "AUTH_LEGACY_START_INVALID_PASSWORD_FORMAT",
  TooManyLoginFailures = "AUTH_LEGACY_START_TOO_MANY_LOGIN_FAILURES",
  TooManyVerificationRequestsByEmail = "AUTH_LEGACY_START_TOO_MANY_VERIFICATION_REQUESTS_BY_EMAIL",
  TooManyVerificationRequestsByIp = "AUTH_LEGACY_START_TOO_MANY_VERIFICATION_REQUESTS_BY_IP",
  InvalidCredentials = "AUTH_LEGACY_START_INVALID_CREDENTIALS",
  CredentialAlreadyLinked = "AUTH_LEGACY_START_CREDENTIAL_ALREADY_LINKED",
}

export enum AuthUserLegacyRegisterErrorCode {
  MissingRequiredFields = "AUTH_LEGACY_REGISTER_MISSING_REQUIRED_FIELDS",
  InvalidEmailFormat = "AUTH_LEGACY_REGISTER_INVALID_EMAIL_FORMAT",
  InvalidPasswordFormat = "AUTH_LEGACY_REGISTER_INVALID_PASSWORD_FORMAT",
  InvalidVerificationTokenFormat = "AUTH_LEGACY_REGISTER_INVALID_VERIFICATION_TOKEN_FORMAT",
  InvalidOrExpiredVerificationToken = "AUTH_LEGACY_REGISTER_INVALID_OR_EXPIRED_VERIFICATION_TOKEN",
  CredentialAlreadyLinked = "AUTH_LEGACY_REGISTER_CREDENTIAL_ALREADY_LINKED",
}

export enum AuthUserOidcCallbackErrorCode {
  MissingStateOrCode = "AUTH_OIDC_CALLBACK_MISSING_STATE_OR_CODE",
  InvalidState = "AUTH_OIDC_CALLBACK_INVALID_STATE",
  AccountAlreadyLinked = "AUTH_OIDC_CALLBACK_ACCOUNT_ALREADY_LINKED",
}

export enum AuthUserIdentitiesPostErrorCode {
  LastIdentityRemovalForbidden = "AUTH_IDENTITIES_DELETE_LAST_IDENTITY_REMOVAL_FORBIDDEN",
}

export enum UsersUserIdPutErrorCode {
  InvalidName = "USERS_USER_ID_PUT_INVALID_NAME",
  InvalidGrade = "USERS_USER_ID_PUT_INVALID_GRADE",
  InvalidHomeclass = "USERS_USER_ID_PUT_INVALID_HOMECLASS",
}

export enum GradesGradeHomeClassesHomeClassNumTimetableErrorCode {
  InvalidGrade = "GRADES_HOME_CLASSES_TIMETABLE_INVALID_GRADE",
  InvalidHomeClassNum = "GRADES_HOME_CLASSES_TIMETABLE_INVALID_HOME_CLASS_NUM",
}

export enum AuthOidcErrorCode {
  GoogleNotConfigured = "AUTH_OIDC_GOOGLE_NOT_CONFIGURED",
  LineNotConfigured = "AUTH_OIDC_LINE_NOT_CONFIGURED",
  UnsupportedProvider = "AUTH_OIDC_UNSUPPORTED_PROVIDER",
  TokenExchangeFailed = "AUTH_OIDC_TOKEN_EXCHANGE_FAILED",
  TokenExchangeResponseInvalid = "AUTH_OIDC_TOKEN_EXCHANGE_RESPONSE_INVALID",
  UserInfoFetchFailed = "AUTH_OIDC_USERINFO_FETCH_FAILED",
  UserInfoMissingSub = "AUTH_OIDC_USERINFO_MISSING_SUB",
}

export enum AuthEmailErrorCode {
  EmailFromNotConfigured = "AUTH_EMAIL_FROM_NOT_CONFIGURED",
  MailConfigIncomplete = "AUTH_EMAIL_CONFIG_INCOMPLETE",
  SendFailed = "AUTH_EMAIL_SEND_FAILED",
  OAuthCredentialsMissing = "AUTH_EMAIL_OAUTH_CREDENTIALS_MISSING",
  OAuthTokenRefreshFailed = "AUTH_EMAIL_OAUTH_TOKEN_REFRESH_FAILED",
}

export enum IcalFeedErrorCode {
  InvalidFeedId = "ICAL_FEED_INVALID_FEED_ID",
  InvalidScopeType = "ICAL_FEED_INVALID_SCOPE_TYPE",
  InvalidTargetGrade = "ICAL_FEED_INVALID_TARGET_GRADE",
  InvalidFormatType = "ICAL_FEED_INVALID_FORMAT_TYPE",
  InvalidCalendarName = "ICAL_FEED_INVALID_CALENDAR_NAME",
  InvalidTemplate = "ICAL_FEED_INVALID_TEMPLATE",
  FeedNotFound = "ICAL_FEED_NOT_FOUND",
  FeedForbidden = "ICAL_FEED_FORBIDDEN",
  FeedGenerationFailed = "ICAL_FEED_GENERATION_FAILED",
  FeedStorageNotConfigured = "ICAL_FEED_STORAGE_NOT_CONFIGURED",
}

export enum TimetableDecodeErrorCode {
  InvalidPersonalSession = "TIMETABLE_DECODE_INVALID_PERSONAL_SESSION",
  InvalidPersonalCourse = "TIMETABLE_DECODE_INVALID_PERSONAL_COURSE",
  InvalidPersonalRoom = "TIMETABLE_DECODE_INVALID_PERSONAL_ROOM",
  InvalidClassSession = "TIMETABLE_DECODE_INVALID_CLASS_SESSION",
  InvalidClassSessionType = "TIMETABLE_DECODE_INVALID_CLASS_SESSION_TYPE",
  InvalidClassCourse = "TIMETABLE_DECODE_INVALID_CLASS_COURSE",
  InvalidClassSelectionId = "TIMETABLE_DECODE_INVALID_CLASS_SELECTION_ID",
  InvalidClassRoomList = "TIMETABLE_DECODE_INVALID_CLASS_ROOM_LIST",
  InvalidWeekdayKey = "TIMETABLE_DECODE_INVALID_WEEKDAY_KEY",
  InvalidSelectionKey = "TIMETABLE_DECODE_INVALID_SELECTION_KEY",
  InvalidPeriodList = "TIMETABLE_DECODE_INVALID_PERIOD_LIST",
}

export enum SharedMemoResolutionErrorCode {
  ScheduleSessionNotFound = "SHARED_MEMO_SCHEDULE_SESSION_NOT_FOUND",
  InvalidSpecialSessionName = "SHARED_MEMO_INVALID_SPECIAL_SESSION_NAME",
  InvalidNormalSessionPosition = "SHARED_MEMO_INVALID_NORMAL_SESSION_POSITION",
  PersonalSessionNotFound = "SHARED_MEMO_PERSONAL_SESSION_NOT_FOUND",
}

export enum UserDataErrorCode {
  UserNotFound = "USER_DATA_USER_NOT_FOUND",
  UserProfileIncomplete = "USER_DATA_PROFILE_INCOMPLETE",
}

export enum InternalDataErrorCode {
  InvalidDateValue = "INTERNAL_DATA_INVALID_DATE_VALUE",
  InvalidTimeString = "INTERNAL_DATA_INVALID_TIME_STRING",
  UnsupportedTimeValue = "INTERNAL_DATA_UNSUPPORTED_TIME_VALUE",
}

export type ApiFieldErrorMap<Field extends string = string> = Partial<
  Record<Field, string>
>;

export interface ApiErrorBody<
  Code extends string = string,
  Field extends string = string,
> {
  code: Code;
  message: string;
  user_message: string;
  field_errors?: ApiFieldErrorMap<Field>;
}

export type ApiAuthUserLegacyStartErrorCode =
  | CommonApiErrorCode
  | AuthUserLegacyStartErrorCode
  | AuthEmailErrorCode;

export type ApiAuthUserLegacyRegisterErrorCode =
  | CommonApiErrorCode
  | AuthUserLegacyRegisterErrorCode;

export type ApiAuthUserOidcCallbackErrorCode =
  | CommonApiErrorCode
  | AuthUserOidcCallbackErrorCode
  | AuthOidcErrorCode;

export type ApiAuthUserIdentitiesPostErrorCode =
  | CommonApiErrorCode
  | AuthUserIdentitiesPostErrorCode;

export type ApiUsersUserIdPutErrorCode =
  | CommonApiErrorCode
  | UsersUserIdPutErrorCode;

export type ApiGradesGradeHomeClassesHomeClassNumTimetableErrorCode =
  | CommonApiErrorCode
  | GradesGradeHomeClassesHomeClassNumTimetableErrorCode
  | UserDataErrorCode
  | TimetableDecodeErrorCode;

export type ApiUsersUserIdTimetableErrorCode =
  | CommonApiErrorCode
  | TimetableDecodeErrorCode;

export type ApiUsersUserIdSchedulesYearMonthDayGetErrorCode =
  | CommonApiErrorCode
  | UserDataErrorCode
  | InternalDataErrorCode;

export type ApiUsersUserIdIcalPersonalFeedErrorCode =
  | CommonApiErrorCode
  | UserDataErrorCode
  | IcalFeedErrorCode;

export type ApiUsersUserIdIcalGradeFeedErrorCode =
  | CommonApiErrorCode
  | UserDataErrorCode
  | IcalFeedErrorCode;

export type ApiUsersUserIdScheduleMemoSharedErrorCode =
  | CommonApiErrorCode
  | SharedMemoResolutionErrorCode
  | UserDataErrorCode;

export type ApiUserDataErrorCode = CommonApiErrorCode | UserDataErrorCode;

export type ApiInternalDataErrorCode =
  | CommonApiErrorCode
  | InternalDataErrorCode;

export type ApiCommonError = ApiErrorBody<CommonApiErrorCode>;

export type ApiUnknownError = ApiErrorBody<string>;
