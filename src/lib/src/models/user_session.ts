import { nanoid } from "nanoid";

import { Option } from "../cmn";
import { auth } from "../knowledge";

export class UserSession {
  public readonly session_id: string;
  public readonly user_id: string;
  public readonly created_at: Date;
  public readonly refreshed_at: Date;
  public readonly expires_at: Date;
  public readonly secret: string;
  public readonly ip_address: Option<string>;
  public readonly user_agent: Option<string>;

  private constructor(
    session_id: string,
    user_id: string,
    created_at: Date,
    refreshed_at: Date,
    expires_at: Date,
    secret: string,
    ip_address: Option<string>,
    user_agent: Option<string>,
  ) {
    this.session_id = session_id;
    this.user_id = user_id;
    this.created_at = created_at;
    this.refreshed_at = refreshed_at;
    this.expires_at = expires_at;
    this.secret = secret;
    this.ip_address = ip_address;
    this.user_agent = user_agent;
  }

  private static generateSessionId(): string {
    return (
      auth.AUTH_ID_FORMATS.session_id_prefix +
      nanoid(auth.AUTH_ID_FORMATS.session_id_random_length)
    );
  }

  private static generateSecret(): string {
    return nanoid(auth.AUTH_ID_FORMATS.session_secret_length);
  }

  public static create(
    user_id: string,
    expires_at: Date,
    ip_address: Option<string>,
    user_agent: Option<string>,
    now = new Date(),
  ): UserSession {
    return new UserSession(
      this.generateSessionId(),
      user_id,
      now,
      now,
      expires_at,
      this.generateSecret(),
      ip_address,
      user_agent,
    );
  }

  public static load(
    session_id: string,
    user_id: string,
    created_at: Date,
    refreshed_at: Date,
    expires_at: Date,
    secret: string,
    ip_address: Option<string>,
    user_agent: Option<string>,
  ): UserSession {
    return new UserSession(
      session_id,
      user_id,
      created_at,
      refreshed_at,
      expires_at,
      secret,
      ip_address,
      user_agent,
    );
  }
}
