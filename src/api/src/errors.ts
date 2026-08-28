import { api } from "@ast24/hmbt-v5-lib";

function defaultCodeByStatus(status: number): api.errors.CommonApiErrorCode {
  switch (status) {
    case 400:
      return api.errors.CommonApiErrorCode.InvalidRequest;
    case 401:
      return api.errors.CommonApiErrorCode.Unauthorized;
    case 403:
      return api.errors.CommonApiErrorCode.Forbidden;
    case 404:
      return api.errors.CommonApiErrorCode.ResourceNotFound;
    case 503:
      return api.errors.CommonApiErrorCode.ServiceUnavailable;
    default:
      return api.errors.CommonApiErrorCode.InternalServerError;
  }
}

type APIErrorInit = {
  status: number;
  code: string;
  message: string;
  user_message?: string;
  field_errors?: api.errors.ApiFieldErrorMap<string>;
};

type APIErrorCompatOptions = {
  code?: string;
  user_message?: string;
  field_errors?: api.errors.ApiFieldErrorMap<string>;
};

export class APIError extends Error {
  public readonly status: number;

  public readonly code: string;

  public readonly user_message: string;

  public readonly field_errors?: api.errors.ApiFieldErrorMap<string>;

  public constructor(
    status: number,
    message: string,
    options?: APIErrorCompatOptions,
  );
  public constructor(init: APIErrorInit);
  public constructor(
    initOrStatus: APIErrorInit | number,
    maybeMessage?: string,
    maybeOptions?: APIErrorCompatOptions,
  ) {
    if (typeof initOrStatus === "number") {
      const status = initOrStatus;
      const message = maybeMessage ?? "Internal Server Error";
      super(message);
      this.name = "APIError";
      this.status = status;
      this.code = maybeOptions?.code ?? defaultCodeByStatus(status);
      this.user_message = maybeOptions?.user_message ?? message;
      this.field_errors = maybeOptions?.field_errors;
      return;
    }

    super(initOrStatus.message);
    this.name = "APIError";
    this.status = initOrStatus.status;
    this.code = initOrStatus.code;
    this.user_message = initOrStatus.user_message ?? initOrStatus.message;
    this.field_errors = initOrStatus.field_errors;
  }
}

export function isAPIError(error: unknown): error is APIError {
  return error instanceof APIError;
}
