import { Option } from "../cmn";

export interface UserInfo {
  name: Option<string>;
  grade: number | null;
  homeclass: number | null;
  has_any_timetable_selection?: boolean;
}
