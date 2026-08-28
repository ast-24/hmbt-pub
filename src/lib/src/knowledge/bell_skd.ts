import { TimeOnly } from "../cmn/time";

export type BellSkdTemplate = {
  morning_shr: number;
  af_morning_shr_break: number;
  sess: BellSkdTemplateSess[];
  inter_sess_break: number;
  lunch_break: number;
  bf_afternoon_shr_break: number;
  afternoon_shr: number;
};

export type BellSkdTemplateSess = {
  length_min: number;
};

export enum CommonBellSkd {
  Normal = "Normal",
  ShortenedA = "ShortenedA",
  ShortenedB = "ShortenedB",
  ShortenedC = "ShortenedC",
}

// !! 覚えてないのでShortenedA/B/Cはスタブ(normalと同じ)
export const BellSkd = {
  [CommonBellSkd.Normal]: {
    morning_shr: 5,
    af_morning_shr_break: 5,
    sess: [
      { length_min: 50 },
      { length_min: 50 },
      { length_min: 50 },
      { length_min: 50 },
      { length_min: 50 },
      { length_min: 50 },
      { length_min: 50 },
    ],
    inter_sess_break: 10,
    lunch_break: 45,
    bf_afternoon_shr_break: 5,
    afternoon_shr: 5,
  },
  [CommonBellSkd.ShortenedA]: {
    morning_shr: 5,
    af_morning_shr_break: 5,
    sess: [
      { length_min: 50 },
      { length_min: 50 },
      { length_min: 50 },
      { length_min: 50 },
      { length_min: 50 },
      { length_min: 50 },
      { length_min: 50 },
    ],
    inter_sess_break: 10,
    lunch_break: 45,
    bf_afternoon_shr_break: 5,
    afternoon_shr: 5,
  },
  [CommonBellSkd.ShortenedB]: {
    morning_shr: 5,
    af_morning_shr_break: 5,
    sess: [
      { length_min: 50 },
      { length_min: 50 },
      { length_min: 50 },
      { length_min: 50 },
      { length_min: 50 },
      { length_min: 50 },
      { length_min: 50 },
    ],
    inter_sess_break: 10,
    lunch_break: 45,
    bf_afternoon_shr_break: 5,
    afternoon_shr: 5,
  },
  [CommonBellSkd.ShortenedC]: {
    morning_shr: 5,
    af_morning_shr_break: 5,
    sess: [
      { length_min: 50 },
      { length_min: 50 },
      { length_min: 50 },
      { length_min: 50 },
      { length_min: 50 },
      { length_min: 50 },
      { length_min: 50 },
    ],
    inter_sess_break: 10,
    lunch_break: 45,
    bf_afternoon_shr_break: 5,
    afternoon_shr: 5,
  },
} as const satisfies Record<CommonBellSkd, BellSkdTemplate>;

export const START_TIME_OF_MORNING_SHR = TimeOnly.new(8, 35);
