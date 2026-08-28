import { api, database, knowledge } from "@ast24/hmbt-v5-lib";

import { requireAuthContext, requireVerifiedStudentAuthContext } from "../auth";
import { decodeOriginalWeeklyTimetableInput } from "../data";
import { withTransaction } from "../db";
import { makeSqlOps } from "../data/sql";
import { APIError } from "../errors";
import { okJson } from "../http";
import { writeAuditLog } from "../audit-log";
import type { EndpointRegistrar } from "../server/endpoint-registrar";
import { readJsonBody, requireParam } from "./utils";

function toHomeClassNum(value: number): knowledge.HomeClassNum | null {
  switch (value) {
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
    case 6:
      return value;
    default:
      return null;
  }
}

export function registerGradesHomeClassRoutes(
  register: EndpointRegistrar,
): void {
  register(
    api.endpoints.APIEndpoint.GradesGradeHomeClassesHomeClassNumTimetableGet,
    async (c) => {
      await requireAuthContext(c, false);

      const grade = Number.parseInt(requireParam(c, "grade"), 10);
      if (!Number.isFinite(grade) || grade < 1 || grade > 3) {
        throw new APIError({
          status: 400,
          code: api.errors.GradesGradeHomeClassesHomeClassNumTimetableErrorCode
            .InvalidGrade,
          message: "Invalid grade",
          user_message: "学年の指定が不正です。",
        });
      }

      const homeClassNum = Number.parseInt(requireParam(c, "homeClassNum"), 10);
      if (
        !Number.isFinite(homeClassNum) ||
        homeClassNum < 1 ||
        homeClassNum > 6
      ) {
        throw new APIError({
          status: 400,
          code: api.errors.GradesGradeHomeClassesHomeClassNumTimetableErrorCode
            .InvalidHomeClassNum,
          message: "Invalid homeClassNum",
          user_message: "クラス番号の指定が不正です。",
        });
      }

      const resolvedHomeClassNum = toHomeClassNum(homeClassNum);
      if (!resolvedHomeClassNum) {
        throw new APIError({
          status: 400,
          code: api.errors.GradesGradeHomeClassesHomeClassNumTimetableErrorCode
            .InvalidHomeClassNum,
          message: "Invalid homeClassNum",
          user_message: "クラス番号の指定が不正です。",
        });
      }

      const timetable = await database.getOriginalWeeklyTimetable(
        grade,
        resolvedHomeClassNum,
        makeSqlOps(),
      );

      return okJson(c, {
        timetable,
      } satisfies api.endpoints.ApiGradesGradeHomeClassesHomeClassNumTimetableGetRes);
    },
  );

  register(
    api.endpoints.APIEndpoint.GradesGradeHomeClassesHomeClassNumTimetablePut,
    async (c) => {
      const auth = await requireVerifiedStudentAuthContext(c, false);

      const grade = Number.parseInt(requireParam(c, "grade"), 10);
      if (!Number.isFinite(grade) || grade < 1 || grade > 3) {
        throw new APIError({
          status: 400,
          code: api.errors.GradesGradeHomeClassesHomeClassNumTimetableErrorCode
            .InvalidGrade,
          message: "Invalid grade",
          user_message: "学年の指定が不正です。",
        });
      }

      const homeClassNum = Number.parseInt(requireParam(c, "homeClassNum"), 10);
      if (
        !Number.isFinite(homeClassNum) ||
        homeClassNum < 1 ||
        homeClassNum > 6
      ) {
        throw new APIError({
          status: 400,
          code: api.errors.GradesGradeHomeClassesHomeClassNumTimetableErrorCode
            .InvalidHomeClassNum,
          message: "Invalid homeClassNum",
          user_message: "クラス番号の指定が不正です。",
        });
      }

      const resolvedHomeClassNum = toHomeClassNum(homeClassNum);
      if (!resolvedHomeClassNum) {
        throw new APIError({
          status: 400,
          code: api.errors.GradesGradeHomeClassesHomeClassNumTimetableErrorCode
            .InvalidHomeClassNum,
          message: "Invalid homeClassNum",
          user_message: "クラス番号の指定が不正です。",
        });
      }

      const req =
        await readJsonBody<api.endpoints.ApiGradesGradeHomeClassesHomeClassNumTimetablePutReq>(
          c,
        );
      const decoded = decodeOriginalWeeklyTimetableInput(req.timetable);

      await withTransaction((tx) =>
        database.upsertOriginalWeeklyTimetable(
          grade,
          resolvedHomeClassNum,
          decoded,
          makeSqlOps(tx),
        ),
      );

      await writeAuditLog(
        c,
        "class_timetable_update",
        {
          grade,
          home_class_num: resolvedHomeClassNum,
          weekday_count: decoded.size,
        },
        auth,
      );

      return okJson(
        c,
        {} satisfies api.endpoints.ApiGradesGradeHomeClassesHomeClassNumTimetablePutRes,
      );
    },
  );
}
