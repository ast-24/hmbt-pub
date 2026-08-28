export type JWT = string;

export type AccessTokenRole = "user" | "system";

export type AccessTokenClaims =
  | {
      typ: "access";
      role: "user";
      sub: string; // user_id
      sid: string; // session_id
    }
  | {
      typ: "access";
      role: "system";
      name: string; // meaningful actor name (not unique)
    };

export interface OidcStateClaims {
  typ: "oidc_state";
  provider: "google" | "line";
  state: string;
  nonce: string;
  is_linking: boolean;
}
