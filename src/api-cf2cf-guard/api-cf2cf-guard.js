// フリーのディストリビューションにはKVSを使う関数を関連付けられないため、
// KVSではなくデプロイ時にこの定数に直接トークンを埋め込む。
const EXPECTED_CF2CF_GUARD_KEY = "";

function forbidden(reason) {
  return {
    statusCode: 403,
    statusDescription: "Not Allowed to access cloudfront directly",
    headers: {
      "x-cf2cf-guard-reached": {
        value: "true",
      },
      "x-cf2cf-guard-reason": {
        value: reason,
      },
    },
  };
}

function serverError() {
  return {
    statusCode: 500,
    statusDescription: "Internal Server Error",
    headers: {
      "x-cf2cf-guard-reached": {
        value: "true",
      },
      "x-cf2cf-guard-reason": {
        value: "Guard misconfiguration",
      },
    },
  };
}

async function handler(event) {
  const request = event.request;

  const guardTokenHeader =
    request.headers &&
    request.headers["x-cf2cf-guard-key"] &&
    request.headers["x-cf2cf-guard-key"].value;

  if (!guardTokenHeader) {
    return forbidden("Missing guard key");
  }

  if (
    typeof EXPECTED_CF2CF_GUARD_KEY !== "string" ||
    EXPECTED_CF2CF_GUARD_KEY.length === 0
  ) {
    return serverError();
  }

  if (guardTokenHeader !== EXPECTED_CF2CF_GUARD_KEY) {
    return forbidden("Invalid guard key");
  }

  return request;
}
