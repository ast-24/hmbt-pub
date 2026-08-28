import { api, database, knowledge, models } from "@ast24/hmbt-v5-lib";

import { requireAuthContext, requireVerifiedStudentAuthContext } from "../auth";
import { uploadCafeMenuImageToR2 } from "../cafe-image";
import * as data from "../data";
import { makeSqlOps } from "../data/sql";
import { withTransaction } from "../db";
import { loadRuntimeEnv } from "../env";
import { APIError } from "../errors";
import { okJson } from "../http";
import { enqueueMonthlyScheduleUpdate } from "../monthly-schedule-update-queue";
import { writeAuditLog } from "../audit-log";
import type { EndpointRegistrar } from "../server/endpoint-registrar";
import {
  parseDatePath,
  parseRangeDays,
  parseYearMonthPath,
  requireParam,
  readJsonBody,
} from "./utils";

export function registerGlobalRoutes(register: EndpointRegistrar): void {
  register(api.endpoints.APIEndpoint.GlobalLineBotUrlGet, async (c) => {
    await requireAuthContext(c, false);
    const env = loadRuntimeEnv({ require_jwt_keys: false });

    return okJson(c, {
      line_bot_url: env.line_bot_url ?? null,
    } satisfies api.endpoints.ApiGlobalLineBotUrlGetRes);
  });

  register(api.endpoints.APIEndpoint.GlobalSchedulesYearMonthGet, async (c) => {
    await requireAuthContext(c, false);

    const { year, month } = parseYearMonthPath(c);
    const skd = await data.getOriginalMonthlySchedule(year, month);

    return okJson(c, {
      skd,
    } satisfies api.endpoints.ApiGlobalSchedulesYearMonthGetRes);
  });

  register(api.endpoints.APIEndpoint.GlobalSchedulesYearMonthPut, async (c) => {
    const auth = await requireVerifiedStudentAuthContext(c, false);

    const { year, month } = parseYearMonthPath(c);
    const req =
      await readJsonBody<api.endpoints.ApiGlobalSchedulesYearMonthPutReq>(c);
    const decoded = data.decodeOriginalMonthlyScheduleInput(req.skd);

    await enqueueMonthlyScheduleUpdate(year, month, decoded);

    await writeAuditLog(
      c,
      "global_schedule_update",
      {
        year,
        month,
        day_count: decoded.length,
      },
      auth,
    );

    return okJson(
      c,
      {} satisfies api.endpoints.ApiGlobalSchedulesYearMonthPutRes,
    );
  });

  register(
    api.endpoints.APIEndpoint.GlobalCafemenuYearMonthDayGet,
    async (c) => {
      await requireAuthContext(c, false);

      const date = parseDatePath(c);
      const rangeDays = parseRangeDays(c);

      const cafeMenu = await database.getCafeMenuRange(
        date,
        rangeDays,
        makeSqlOps(),
      );

      return okJson(c, {
        cafe_menu: cafeMenu,
      } satisfies api.endpoints.ApiGlobalCafemenuYearMonthDayGetRes);
    },
  );

  register(
    api.endpoints.APIEndpoint.GlobalCafemenuYearMonthDayImagePost,
    async (c) => {
      const auth = await requireVerifiedStudentAuthContext(c, false);

      const date = parseDatePath(c);
      const rangeDays = parseRangeDays(c);
      const req =
        await readJsonBody<api.endpoints.ApiGlobalCafemenuYearMonthDayImagePostReq>(
          c,
        );

      const imageDataUrl =
        typeof req.image_data_url === "string" ? req.image_data_url.trim() : "";
      if (!imageDataUrl) {
        throw new APIError({
          status: 400,
          code: api.errors.CommonApiErrorCode.InvalidRequest,
          message: "image_data_url is required",
          user_message: "画像データを指定してください。",
        });
      }

      const uploaded = await uploadCafeMenuImageToR2(
        imageDataUrl,
        date,
        rangeDays,
      );

      await withTransaction((tx) =>
        database.upsertCafeMenuImageRange(
          date,
          rangeDays,
          uploaded.imageUrl,
          uploaded.previewImageUrl,
          makeSqlOps(tx),
        ),
      );

      await writeAuditLog(
        c,
        "cafemenu_post",
        {
          year: date.getUTCFullYear(),
          month: date.getUTCMonth() + 1,
          day: date.getUTCDate(),
          range_days: rangeDays,
          image_url: uploaded.imageUrl,
          preview_image_url: uploaded.previewImageUrl,
          image_id: uploaded.imageUrl.split("/").pop() ?? null,
          preview_image_id: uploaded.previewImageUrl.split("/").pop() ?? null,
        },
        auth,
      );

      return okJson(c, {
        image_url: uploaded.imageUrl,
        preview_image_url: uploaded.previewImageUrl,
        range_days: rangeDays,
      } satisfies api.endpoints.ApiGlobalCafemenuYearMonthDayImagePostRes);
    },
  );

  register(
    api.endpoints.APIEndpoint.GlobalTrainTimetableTimetableIdYearMonthDayGet,
    async (c) => {
      await requireAuthContext(c, false);

      const timetableId = requireParam(c, "timetableId");
      const date = parseDatePath(c);

      const payload = await database.getTrainTimetablePayload(
        timetableId,
        makeSqlOps(),
      );
      if (!payload) {
        throw new APIError({
          status: 404,
          code: api.errors.CommonApiErrorCode.ResourceNotFound,
          message: `Train timetable not found: ${timetableId}`,
          user_message: "指定された時刻表が見つかりませんでした。",
        });
      }

      const dateKey = `${date.getUTCFullYear()}-${String(
        date.getUTCMonth() + 1,
      ).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
      const weekday = date.getUTCDay(); // UTC midnight == JST same date

      const isHoliday =
        knowledge.holidays.HOLIDAY_DATE_KEY_SET.has(dateKey) ||
        weekday === 0;
      const kind: models.train_timetable.TrainTimetableKind = isHoliday
        ? "holiday"
        : weekday === 6
          ? "saturday"
          : "weekday";

      return okJson(c, {
        timetable: payload[kind],
      } satisfies api.endpoints.ApiGlobalTrainTimetableTimetableIdYearMonthDayGetRes);
    },
  );
}
