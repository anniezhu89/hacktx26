import {
  communityBoardResponse,
  communityConfigResponse,
  communityFilters,
  communityListingResponse,
  communityPreferencesRequest,
  communityPreferencesResponse,
  communitySavedResponse,
  communitySaveRequest,
} from "@labelbridge/contracts";
import { ApiError, parseBody } from "../errors";
import { rateLimit } from "../limits";
import { requireAccount, type RouteContext } from "../routes/context";
import { communityConfig, defaults } from "./config";
import type { CommunityService } from "./service";
export function registerCommunityRoutes(
  ctx: RouteContext,
  service: CommunityService | null,
) {
  const { api, send } = ctx;
  api.get("/community/config", (_req, res) =>
    send(res, communityConfigResponse, {
      enabled: !!service,
      mode: service?.config.mode ?? "fixture",
      defaults,
      limits: service?.config.limits ?? communityConfig({}).limits,
    }),
  );
  api.use("/community", (_req, _res, next) => {
    if (!service)
      throw new ApiError("NOT_FOUND", "Community board is disabled.");
    next();
  });
  if (!service) return;
  const user = (res: Parameters<RouteContext["send"]>[0]) =>
    ctx.accounts.get(res.locals.session?.accountId)?.id;
  api.get(
    "/community/listings",
    rateLimit("community-search", { limit: 20, windowMs: 60000 }, ctx.now),
    async (req, res) => {
      const q = req.query;
      const unknown = Object.keys(q).some(
        (k) =>
          ![
            "location",
            "radiusMiles",
            "dateWindowDays",
            "categories",
            "freeOnly",
            "kind",
          ].includes(k),
      );
      if (unknown || Object.values(q).some((v) => typeof v !== "string"))
        throw new ApiError("BAD_REQUEST", "Invalid community filters.");
      if (
        q.freeOnly !== undefined &&
        !["true", "false"].includes(String(q.freeOnly))
      )
        throw new ApiError("BAD_REQUEST", "Invalid free-only filter.");
      const filters = parseBody(communityFilters, {
        location: q.location,
        ...(q.radiusMiles ? { radiusMiles: Number(q.radiusMiles) } : {}),
        ...(q.dateWindowDays
          ? { dateWindowDays: Number(q.dateWindowDays) }
          : {}),
        ...(q.categories
          ? { categories: String(q.categories).split(",").filter(Boolean) }
          : {}),
        ...(q.freeOnly ? { freeOnly: q.freeOnly === "true" } : {}),
        ...(q.kind ? { kind: q.kind } : {}),
      });
      const board = await service.search(filters, user(res));
      res.locals.dataMode =
        board.cache.status !== "fresh" && service.config.mode === "live"
          ? "cached"
          : service.config.mode;
      send(res, communityBoardResponse, board);
    },
  );
  api.post(
    "/community/refresh",
    rateLimit("community-refresh", { limit: 3, windowMs: 60000 }, ctx.now),
    async (req, res) => {
      const { account } = requireAccount(ctx, res);
      const filters = parseBody(communityFilters, req.body);
      const board = await service.search(filters, account.id, true);
      res.locals.dataMode = service.config.mode;
      send(res, communityBoardResponse, board);
    },
  );
  api.get("/community/listings/:id", (req, res) => {
    const data = service.detail(req.params.id, user(res));
    res.locals.dataMode = data.listing.dataMode;
    send(res, communityListingResponse, data);
  });
  const saved = (id: string) =>
    service.store.saved(id).map((l) => service.detail(l.id, id));
  api.get("/community/saved", (_req, res) => {
    const { account } = requireAccount(ctx, res);
    send(res, communitySavedResponse, saved(account.id));
  });
  api.post("/community/saved", (req, res) => {
    const { account } = requireAccount(ctx, res);
    const input = parseBody(communitySaveRequest, req.body);
    service.store.save(account.id, input.listingId);
    send(res, communitySavedResponse, saved(account.id));
  });
  api.delete("/community/saved/:id", (req, res) => {
    const { account } = requireAccount(ctx, res);
    service.store.remove(account.id, req.params.id);
    send(res, communitySavedResponse, saved(account.id));
  });
  api.get("/community/preferences", (_req, res) => {
    const { account } = requireAccount(ctx, res);
    send(
      res,
      communityPreferencesResponse,
      service.preferences(account.id, account.location),
    );
  });
  api.put("/community/preferences", (req, res) => {
    const { account } = requireAccount(ctx, res);
    const filters = parseBody(communityPreferencesRequest, req.body);
    service.store.setPreferences(account.id, filters);
    account.location = filters.location;
    send(
      res,
      communityPreferencesResponse,
      service.preferences(account.id, account.location),
    );
  });
}
