import { api } from "@ast24/hmbt-v5-lib";

import {
  executeBatchCalls,
  apiGetAuthUserMe,
  apiGetUsersUserId,
  handleApiError,
  isNoAuthApiResult,
  pickBatchResult,
  type ApiErrorInfo,
} from "@/shared/api/endpoints-client";

export type SetupStepId =
  | "verify-student"
  | "profile"
  | "personal-timetable"
  | "web-ui";

export type SetupSnapshot = {
  isVerifiedAsStudent: boolean;
  grade: number | null;
  homeclass: number | null;
  hasGradeAndHomeClass: boolean;
  hasPersonalTimetable: boolean;
};

export type SetupStepDefinition = {
  id: SetupStepId;
  title: string;
  optional: boolean;
  isCompleted: (snapshot: SetupSnapshot) => boolean;
};

export const SETUP_STEP_DEFINITIONS: readonly SetupStepDefinition[] = [
  {
    id: "verify-student",
    title: "生徒認証",
    optional: false,
    isCompleted: (snapshot) => snapshot.isVerifiedAsStudent,
  },
  {
    id: "profile",
    title: "学年・クラス",
    optional: false,
    isCompleted: (snapshot) => snapshot.hasGradeAndHomeClass,
  },
  {
    id: "personal-timetable",
    title: "個人時間割",
    optional: false,
    isCompleted: (snapshot) => snapshot.hasPersonalTimetable,
  },
  {
    id: "web-ui",
    title: "ホームUI設定",
    optional: true,
    isCompleted: () => false,
  },
] as const;

export type SetupSnapshotResult =
  | {
      type: "success";
      snapshot: SetupSnapshot;
    }
  | {
      type: "no_auth";
    }
  | {
      type: "error";
      error: ApiErrorInfo | { type: "network_error"; message: string };
    };

type SetupSnapshotPrefetchedResults = {
  authResult?: Awaited<ReturnType<typeof apiGetAuthUserMe>>;
  userResult?: Awaited<ReturnType<typeof apiGetUsersUserId>>;
};

function normalizeGrade(value: unknown): number | null {
  if (!Number.isInteger(value)) {
    return null;
  }

  const grade = Number(value);
  if (grade < 1 || grade > 3) {
    return null;
  }

  return grade;
}

function normalizeHomeclass(value: unknown): number | null {
  if (!Number.isInteger(value)) {
    return null;
  }

  const homeclass = Number(value);
  if (homeclass < 1 || homeclass > 6) {
    return null;
  }

  return homeclass;
}

export function isSetupRequired(snapshot: SetupSnapshot): boolean {
  return SETUP_STEP_DEFINITIONS.some(
    (step) => !step.optional && !step.isCompleted(snapshot),
  );
}

export function resolveActiveSetupStepId(snapshot: SetupSnapshot): SetupStepId {
  const firstPending = SETUP_STEP_DEFINITIONS.find(
    (step) => !step.optional && !step.isCompleted(snapshot),
  );

  if (firstPending) {
    return firstPending.id;
  }

  return "web-ui";
}

export async function fetchSetupSnapshot(
  prefetched: SetupSnapshotPrefetchedResults = {},
): Promise<SetupSnapshotResult> {
  let authRes = prefetched.authResult;
  let userRes = prefetched.userResult;

  if (!authRes || !userRes) {
    const batchResults = await executeBatchCalls([
      ...(!authRes
        ? [
            {
              key: "setup-auth",
              endpoint:
                api.endpoints.API_ENDPOINTS[
                  api.endpoints.APIEndpoint.AuthUserMeGet
                ],
              pathParams: {},
              fallbackMessage: "認証状態の取得に失敗しました",
              stubCall: () => apiGetAuthUserMe(),
            },
          ]
        : []),
      ...(!userRes
        ? [
            {
              key: "setup-user",
              endpoint:
                api.endpoints.API_ENDPOINTS[
                  api.endpoints.APIEndpoint.UsersUserIdGet
                ],
              pathParams: { userId: "me" },
              fallbackMessage: "ユーザ情報の取得に失敗しました",
              stubCall: () => apiGetUsersUserId("me"),
            },
          ]
        : []),
    ]);

    if (!authRes) {
      authRes = pickBatchResult<
        api.endpoints.ApiAuthUserMeGetRes,
        api.endpoints.ApiAuthUserMeGetErr
      >(batchResults, "setup-auth", "認証状態の取得に失敗しました");
    }

    if (!userRes) {
      userRes = pickBatchResult<
        api.endpoints.ApiUsersUserIdGetRes,
        api.endpoints.ApiUsersUserIdGetErr
      >(batchResults, "setup-user", "ユーザ情報の取得に失敗しました");
    }
  }

  if (!authRes || !userRes) {
    return {
      type: "error",
      error: {
        type: "network_error",
        message: "セットアップ状態の取得に失敗しました",
      },
    };
  }

  if (isNoAuthApiResult(authRes) || isNoAuthApiResult(userRes)) {
    return { type: "no_auth" };
  }

  const authError = handleApiError(authRes);
  if (authError || authRes.type !== "success") {
    return {
      type: "error",
      error: authError ?? {
        type: "network_error",
        message: "認証状態の取得に失敗しました",
      },
    };
  }

  const userError = handleApiError(userRes);
  if (userError || userRes.type !== "success") {
    return {
      type: "error",
      error: userError ?? {
        type: "network_error",
        message: "ユーザ情報の取得に失敗しました",
      },
    };
  }

  const grade = normalizeGrade(userRes.data.user_info.grade);
  const homeclass = normalizeHomeclass(userRes.data.user_info.homeclass);
  const hasPersonalTimetable =
    authRes.data.is_verified_as_student &&
    userRes.data.user_info.has_any_timetable_selection === true;

  return {
    type: "success",
    snapshot: {
      isVerifiedAsStudent: authRes.data.is_verified_as_student,
      grade,
      homeclass,
      hasGradeAndHomeClass: grade !== null && homeclass !== null,
      hasPersonalTimetable,
    },
  };
}
