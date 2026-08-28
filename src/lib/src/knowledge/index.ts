import { Room, Rooms } from "./room";

export * as room from "./room";
export * as course from "./course";
export * as bell_skd from "./bell_skd";
export * as auth from "./auth";
export * as train_timetable from "./train_timetable";
export * as holidays from "./holidays_server";

export const HOSTNAMES = {
  WEB: "hmbt.ast24.dev",
  API: "api-hmbt.ast24.dev",
  LINE_BOT: "line-hmbt.ast24.dev",
  ICAL: "ical-hmbt.ast24.dev",
  CAFEMENU_IMAGE: "menuimage-hmbt.ast24.dev",
  ADMIN_MESSENGER: "adminalert-hmbt.ast24.dev",
};

// 出席番号
export type StudentIdInClass = number;

// クラス(※これは所属ホームルームであり授業場所はRoomと呼称)
export type HomeClassNum = 1 | 2 | 3 | 4 | 5 | 6;

export const HomeClassNumUtil = {
  getHomeRoom(home_class: HomeClassNum): Room {
    switch (home_class) {
      case 1:
        return Rooms.S33;
      case 2:
        return Rooms.S34;
      case 3:
        return Rooms.S35;
      case 4:
        return Rooms.S36;
      case 5:
        return Rooms.S37;
      case 6:
        return Rooms.S38;
    }
  },
};

// 同じ学年の生徒であるためにメールアドレスが一致する必要のある正規表現
// export const STUDENT_EMAIL_REGEX = /^y15274\d{3}@edu\.city\.yokohama\.jp$/;

export const STUDENT_EMAIL_REGEX = /^y\d{8}@edu\.city\.yokohama\.jp$/;
