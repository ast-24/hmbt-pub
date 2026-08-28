import { nanoid } from "nanoid";
import { Option } from "../cmn";
import { HomeClassNum, auth } from "../knowledge";

export class User {
  public readonly id: string;
  public name: Option<string>;
  public grade: number | null;
  public homeclass: HomeClassNum | null;
  public readonly is_verified_as_student: boolean;
  public readonly has_any_timetable_selection: boolean;

  private constructor(
    id: string,
    name: Option<string>,
    grade: number | null,
    homeclass: HomeClassNum | null,
    is_verified_as_student: boolean,
    has_any_timetable_selection: boolean,
  ) {
    this.id = id;
    this.name = name;
    this.grade = grade;
    this.homeclass = homeclass;
    this.is_verified_as_student = is_verified_as_student;
    this.has_any_timetable_selection = has_any_timetable_selection;
  }

  private static generateId(): string {
    return (
      auth.AUTH_ID_FORMATS.user_id_prefix +
      nanoid(auth.AUTH_ID_FORMATS.user_id_random_length)
    );
  }

  public static create(
    name: Option<string>,
    grade: number | null,
    homeclass: HomeClassNum | null,
  ): User {
    return new User(this.generateId(), name, grade, homeclass, false, false);
  }

  public static load(
    id: string,
    name: Option<string>,
    grade: number | null,
    homeclass: HomeClassNum | null,
    is_verified_as_student: boolean,
    has_any_timetable_selection: boolean,
  ): User {
    return new User(
      id,
      name,
      grade,
      homeclass,
      is_verified_as_student,
      has_any_timetable_selection,
    );
  }
}

export type UserIdentifier =
  | {
      type: "legacy";
      email: string;
    }
  | {
      type: "google_oidc";
      sub: string;
      email_verified_as_owner: boolean;
      email: Option<string>;
      org: Option<string>;
    }
  | {
      type: "line_oidc";
      sub: string;
      verified_as_student_in_v4: boolean;
      linked_email_in_v4: Option<string>;
    };

export type UserIdentifierSpec =
  | {
      type: "legacy";
      email: string;
    }
  | {
      type: "google_oidc";
      sub: string;
    }
  | {
      type: "line_oidc";
      sub: string;
    };
