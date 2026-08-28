import { api } from "@ast24/hmbt-v5-lib";

import { requireAuthContext, resolveTargetUserId } from "../auth";
import { APIError } from "../errors";
import { okJson } from "../http";
import {
  createGradeIcalFeedForOwner,
  createPersonalIcalFeedForOwner,
  deleteGradeIcalFeedForOwner,
  deletePersonalIcalFeedForOwner,
  listGradeIcalFeedsForOwner,
  listPersonalIcalFeedsForOwner,
  regenerateGradeIcalFeedForOwner,
  regeneratePersonalIcalFeedForOwner,
  updateGradeIcalFeedForOwner,
  updatePersonalIcalFeedForOwner,
} from "../ical-feed-service";
import type { EndpointRegistrar } from "../server/endpoint-registrar";
import { readJsonBody, requireParam } from "./utils";

function parseFeedId(raw: string): number {
  const feedId = Number.parseInt(raw, 10);
  if (!Number.isInteger(feedId) || feedId <= 0) {
    throw new APIError({
      status: 400,
      code: api.errors.IcalFeedErrorCode.InvalidFeedId,
      message: "feedId must be a positive integer",
      user_message: "フィードIDの指定が不正です。",
    });
  }
  return feedId;
}

export function registerIcalRoutes(register: EndpointRegistrar): void {
  register(
    api.endpoints.APIEndpoint.UsersUserIdIcalPersonalFeedsGet,
    async (c) => {
      const auth = await requireAuthContext(c, false);
      const userId = resolveTargetUserId(auth, requireParam(c, "userId"));

      const feeds = await listPersonalIcalFeedsForOwner(userId);

      return okJson(c, {
        feeds,
      } satisfies api.endpoints.ApiUsersUserIdIcalPersonalFeedsGetRes);
    },
  );

  register(
    api.endpoints.APIEndpoint.UsersUserIdIcalPersonalFeedsPost,
    async (c) => {
      const auth = await requireAuthContext(c, false);
      const userId = resolveTargetUserId(auth, requireParam(c, "userId"));
      const req =
        await readJsonBody<api.endpoints.ApiUsersUserIdIcalPersonalFeedsPostReq>(
          c,
        );

      const feed = await createPersonalIcalFeedForOwner(userId, req);

      return okJson(c, {
        feed,
      } satisfies api.endpoints.ApiUsersUserIdIcalPersonalFeedsPostRes);
    },
  );

  register(
    api.endpoints.APIEndpoint.UsersUserIdIcalPersonalFeedsFeedIdPut,
    async (c) => {
      const auth = await requireAuthContext(c, false);
      const userId = resolveTargetUserId(auth, requireParam(c, "userId"));
      const feedId = parseFeedId(requireParam(c, "feedId"));
      const req =
        await readJsonBody<api.endpoints.ApiUsersUserIdIcalPersonalFeedsFeedIdPutReq>(
          c,
        );

      const feed = await updatePersonalIcalFeedForOwner(userId, feedId, req);

      return okJson(c, {
        feed,
      } satisfies api.endpoints.ApiUsersUserIdIcalPersonalFeedsFeedIdPutRes);
    },
  );

  register(
    api.endpoints.APIEndpoint.UsersUserIdIcalPersonalFeedsFeedIdDelete,
    async (c) => {
      const auth = await requireAuthContext(c, false);
      const userId = resolveTargetUserId(auth, requireParam(c, "userId"));
      const feedId = parseFeedId(requireParam(c, "feedId"));

      await deletePersonalIcalFeedForOwner(userId, feedId);

      return okJson(
        c,
        {} satisfies api.endpoints.ApiUsersUserIdIcalPersonalFeedsFeedIdDeleteRes,
      );
    },
  );

  register(
    api.endpoints.APIEndpoint.UsersUserIdIcalPersonalFeedsFeedIdRegeneratePost,
    async (c) => {
      const auth = await requireAuthContext(c, false);
      const userId = resolveTargetUserId(auth, requireParam(c, "userId"));
      const feedId = parseFeedId(requireParam(c, "feedId"));

      const feed = await regeneratePersonalIcalFeedForOwner(userId, feedId);

      return okJson(c, {
        feed,
      } satisfies api.endpoints.ApiUsersUserIdIcalPersonalFeedsFeedIdRegeneratePostRes);
    },
  );

  register(
    api.endpoints.APIEndpoint.UsersUserIdIcalGradeFeedsGet,
    async (c) => {
      const auth = await requireAuthContext(c, false);
      const userId = resolveTargetUserId(auth, requireParam(c, "userId"));

      const feeds = await listGradeIcalFeedsForOwner(userId);

      return okJson(c, {
        feeds,
      } satisfies api.endpoints.ApiUsersUserIdIcalGradeFeedsGetRes);
    },
  );

  register(
    api.endpoints.APIEndpoint.UsersUserIdIcalGradeFeedsPost,
    async (c) => {
      const auth = await requireAuthContext(c, false);
      const userId = resolveTargetUserId(auth, requireParam(c, "userId"));
      const req =
        await readJsonBody<api.endpoints.ApiUsersUserIdIcalGradeFeedsPostReq>(
          c,
        );

      const feed = await createGradeIcalFeedForOwner(userId, req);

      return okJson(c, {
        feed,
      } satisfies api.endpoints.ApiUsersUserIdIcalGradeFeedsPostRes);
    },
  );

  register(
    api.endpoints.APIEndpoint.UsersUserIdIcalGradeFeedsFeedIdPut,
    async (c) => {
      const auth = await requireAuthContext(c, false);
      const userId = resolveTargetUserId(auth, requireParam(c, "userId"));
      const feedId = parseFeedId(requireParam(c, "feedId"));
      const req =
        await readJsonBody<api.endpoints.ApiUsersUserIdIcalGradeFeedsFeedIdPutReq>(
          c,
        );

      const feed = await updateGradeIcalFeedForOwner(userId, feedId, req);

      return okJson(c, {
        feed,
      } satisfies api.endpoints.ApiUsersUserIdIcalGradeFeedsFeedIdPutRes);
    },
  );

  register(
    api.endpoints.APIEndpoint.UsersUserIdIcalGradeFeedsFeedIdDelete,
    async (c) => {
      const auth = await requireAuthContext(c, false);
      const userId = resolveTargetUserId(auth, requireParam(c, "userId"));
      const feedId = parseFeedId(requireParam(c, "feedId"));

      await deleteGradeIcalFeedForOwner(userId, feedId);

      return okJson(
        c,
        {} satisfies api.endpoints.ApiUsersUserIdIcalGradeFeedsFeedIdDeleteRes,
      );
    },
  );

  register(
    api.endpoints.APIEndpoint.UsersUserIdIcalGradeFeedsFeedIdRegeneratePost,
    async (c) => {
      const auth = await requireAuthContext(c, false);
      const userId = resolveTargetUserId(auth, requireParam(c, "userId"));
      const feedId = parseFeedId(requireParam(c, "feedId"));

      const feed = await regenerateGradeIcalFeedForOwner(userId, feedId);

      return okJson(c, {
        feed,
      } satisfies api.endpoints.ApiUsersUserIdIcalGradeFeedsFeedIdRegeneratePostRes);
    },
  );
}
