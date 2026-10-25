import {
  communityListing,
  type CommunityFilters,
  type CommunityListing,
} from "@labelbridge/contracts";
import { ApiError } from "../errors";
const retention = 7 * 24 * 60 * 60 * 1000;
/** Public listing records never contain a user's distance, interests or save status. */
export class CommunityStore {
  private listings = new Map<string, CommunityListing>();
  private relations = new Map<string, Map<string, number>>();
  private preferences = new Map<
    string,
    { filters: CommunityFilters; touched: number }
  >();
  constructor(private now: () => number = Date.now) {}
  upsert(listing: CommunityListing) {
    this.sweep();
    const valid = communityListing.parse(listing);
    if (this.listings.size >= 1000 && !this.listings.has(valid.id))
      this.listings.delete(this.listings.keys().next().value!);
    this.listings.set(valid.id, valid);
    return valid;
  }
  get(id: string) {
    this.sweep();
    return this.listings.get(id);
  }
  save(accountId: string, id: string) {
    if (!this.get(id))
      throw new ApiError(
        "NOT_FOUND",
        "Community listing not found. Search again before saving.",
      );
    const saved = this.relations.get(accountId) ?? new Map<string, number>();
    if (saved.size >= 100 && !saved.has(id))
      throw new ApiError(
        "RATE_LIMITED",
        "You can save up to 100 community listings.",
      );
    saved.set(id, this.now());
    this.relations.set(accountId, saved);
  }
  remove(accountId: string, id: string) {
    this.relations.get(accountId)?.delete(id);
  }
  isSaved(accountId: string | undefined, id: string) {
    this.sweep();
    return !!accountId && !!this.relations.get(accountId)?.has(id);
  }
  saved(accountId: string) {
    this.sweep();
    return [...(this.relations.get(accountId)?.keys() ?? [])].flatMap(
      (id) => this.listings.get(id) ?? [],
    );
  }
  setPreferences(accountId: string, filters: CommunityFilters) {
    this.preferences.set(accountId, {
      filters: structuredClone(filters),
      touched: this.now(),
    });
  }
  getPreferences(accountId: string) {
    this.sweep();
    const value = this.preferences.get(accountId);
    return value ? structuredClone(value.filters) : null;
  }
  forgetAccount(accountId: string) {
    this.preferences.delete(accountId);
    this.relations.delete(accountId);
  }
  sweep() {
    for (const [id, listing] of this.listings)
      if (this.now() - Date.parse(listing.retrievedAt) > retention)
        this.listings.delete(id);
    for (const [user, saved] of this.relations) {
      for (const [id, time] of saved)
        if (!this.listings.has(id) || this.now() - time > retention)
          saved.delete(id);
      if (!saved.size) this.relations.delete(user);
    }
    for (const [user, prefs] of this.preferences)
      if (this.now() - prefs.touched > retention) this.preferences.delete(user);
  }
}
