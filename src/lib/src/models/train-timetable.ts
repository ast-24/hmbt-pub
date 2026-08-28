export type TrainTimetableKind = "weekday" | "saturday" | "holiday";

// hour(0-23) -> minutes
export type TrainTimetableHourMap = Record<string, number[]>;

export type TrainTimetablePayload = {
  weekday: TrainTimetableHourMap;
  saturday: TrainTimetableHourMap;
  holiday: TrainTimetableHourMap;
};

