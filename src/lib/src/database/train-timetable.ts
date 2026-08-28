import type * as models from "../models";
import type { SqlOps } from "./sql";

export type TrainTimetableRow = {
  timetable_id: string;
  payload_json: string | object;
};

export async function getTrainTimetablePayload(
  timetableId: string,
  sqlOps: SqlOps,
): Promise<models.train_timetable.TrainTimetablePayload | null> {
  const rows = await sqlOps.selectRows<TrainTimetableRow[]>(
    `
      SELECT timetable_id, payload_json
      FROM train_timetables
      WHERE timetable_id = ?
      LIMIT 1
    `,
    [timetableId],
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  let payload: unknown = row.payload_json;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload) as unknown;
    } catch {
      return null;
    }
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  return payload as models.train_timetable.TrainTimetablePayload;
}

