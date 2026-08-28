import type { dto } from "@ast24/hmbt-v5-lib";

export interface AuthContext {
  role: dto.jwt.AccessTokenRole;
  user_id: string;
  session_id: string | null;
  has_access_token: boolean;
}
