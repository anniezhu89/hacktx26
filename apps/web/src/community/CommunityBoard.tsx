import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  COMMUNITY_CATEGORY_LABELS,
  communityCategory,
  communityFilters,
  type CommunityBoard as BoardData,
  type CommunityCategory,
  type CommunityFilters,
  type CommunityListing,
  type CommunityView,
} from "@labelbridge/contracts";
import type { AccountSession } from "../state/useAccount";
import { toApiError } from "../api/client";
import { communityClient } from "./client";
import "./community.css";
const initial = (location?: string) =>
  communityFilters.parse({ location: location ?? "Austin, TX" });
const sections = {
  nearby: "Nearby opportunities",
  online: "Online opportunities",
  distance_unverified: "Distance not verified",
  date_unverified: "Date not verified",
};
export function communityDateLabel(listing: CommunityListing) {
  if (listing.kind === "ongoing_resource")
    return "Ongoing resource — no event date";
  if (listing.dateStatus !== "confirmed" || !listing.startAt)
    return `${listing.dateStatus === "conflicting" ? "Conflicting" : "Incomplete"} date: ${listing.originalDateText ?? "Not listed"}`;
  if (listing.startAt.length === 10) {
    const [year, month, day] = listing.startAt.split("-").map(Number);
    return (
      new Intl.DateTimeFormat("en-US", {
        dateStyle: "long",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(year, month - 1, day))) + " · Time not listed"
    );
  }
  return (
    new Intl.DateTimeFormat("en-US", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: listing.timezone ?? "UTC",
    }).format(new Date(listing.startAt)) +
    ` (${listing.timezone ?? "UTC; local timezone not listed"})`
  );
}
function stamp(value: string) {
  return new Date(value).toLocaleString();
}
export function CommunityBoard({
  account,
  onSignIn,
}: {
  account: AccountSession;
  onSignIn: () => void;
}) {
  const me = account.account;
  const [filters, setFilters] = useState<CommunityFilters>(() =>
    initial(me?.location),
  );
  const [board, setBoard] = useState<BoardData | null>(null);
  const [savedItems, setSavedItems] = useState<CommunityView[]>([]);
  const [savedOnly, setSavedOnly] = useState(false);
  const [pending, setPending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [ready, setReady] = useState(!me);
  const [saveDefault, setSaveDefault] = useState(false);
  const searchAbort = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    return () => searchAbort.current?.abort();
  }, []);
  useEffect(() => {
    const ctrl = new AbortController();
    if (!me) {
      setReady(true);
      return () => ctrl.abort();
    }
    setReady(false);
    Promise.all([
      communityClient.preferences(ctrl.signal),
      communityClient.saved(ctrl.signal),
    ]).then(
      ([prefs, saves]) => {
        setFilters(prefs.filters);
        setSavedItems(saves);
        setReady(true);
      },
      (e) => {
        if (e.name !== "AbortError") {
          setError(toApiError(e).message);
          setReady(true);
        }
      },
    );
    return () => ctrl.abort();
  }, [me?.id]);
  async function search(next = filters, refresh = false) {
    const valid = communityFilters.safeParse(next);
    if (!valid.success) {
      setError(valid.error.issues[0]?.message ?? "Check your filters.");
      return;
    }
    const ctrl = new AbortController();
    searchAbort.current?.abort();
    searchAbort.current = ctrl;
    setPending(true);
    setError(null);
    setNotice("");
    setSavedOnly(false);
    if (!refresh) setBoard(null);
    try {
      const result = refresh
        ? await communityClient.refresh(valid.data, ctrl.signal)
        : await communityClient.search(valid.data, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setBoard(result);
      setNotice(
        `${result.items.length} ${result.items.length === 1 ? "opportunity" : "opportunities"} loaded.`,
      );
      if (saveDefault && me) {
        await communityClient.saveDefaults(valid.data);
        if (await account.refresh())
          setNotice(
            "Results loaded. Community defaults and profile location saved.",
          );
        else
          setNotice(
            "Community defaults saved; reload to update the profile display.",
          );
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(toApiError(e).message);
        if (refresh)
          setBoard(
            (previous) =>
              previous && {
                ...previous,
                cache: { ...previous.cache, status: "stale" },
                warnings: [
                  ...previous.warnings,
                  "Refresh unavailable; previous retrieval timestamps retained.",
                ],
                items: previous.items.map((view) => ({
                  ...view,
                  listing: {
                    ...view.listing,
                    dataMode:
                      view.listing.dataMode === "fixture"
                        ? "fixture"
                        : "cached",
                  },
                })),
              },
          );
      }
    } finally {
      if (!ctrl.signal.aborted) setPending(false);
    }
  }
  async function toggleSave(view: CommunityView) {
    if (!me) {
      setNotice("Sign in to save opportunities privately.");
      return;
    }
    setBusyId(view.listing.id);
    setError(null);
    try {
      const result = await communityClient.save(view.listing.id, view.saved);
      setSavedItems(result);
      const ids = new Set(result.map((i) => i.listing.id));
      setBoard(
        (b) =>
          b && {
            ...b,
            items: b.items.map((i) => ({ ...i, saved: ids.has(i.listing.id) })),
          },
      );
      setNotice(
        view.saved
          ? "Opportunity removed from saved."
          : "Opportunity saved privately for this demo account.",
      );
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setBusyId(null);
    }
  }
  async function share(listing: CommunityListing) {
    try {
      await navigator.clipboard.writeText(listing.sourceUrl);
      setNotice(
        "Public source link copied. No account or attendance information is included.",
      );
    } catch {
      setNotice(
        "Copy unavailable. Open the source link and copy its public address.",
      );
    }
  }
  function category(value: CommunityCategory, checked: boolean) {
    if (checked && filters.categories.length >= 3) {
      setNotice("Choose up to three interests.");
      return;
    }
    setFilters((f) => ({
      ...f,
      categories: checked
        ? [...f.categories, value]
        : f.categories.filter((c) => c !== value),
    }));
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    void search();
  }
  const items = savedOnly ? savedItems : (board?.items ?? []);
  return (
    <main id="main" tabIndex={-1} className="workspace shell community-board">
      <header className="page-head">
        <div>
          <span className="eyebrow">Local connections</span>
          <h1 ref={heading} tabIndex={-1}>
            Community Resource Board
          </h1>
          <p>
            Discover public opportunities around a city or ZIP. Choose interests
            yourself; your labels and private health information are never used.
          </p>
        </div>
      </header>
      {!me?.location && (
        <p className="banner banner-info">
          {me
            ? "Your profile has no saved location."
            : "Explore without an account."}{" "}
          Austin, TX is the initial demo area. Enter a city and state or ZIP; do
          not enter a home address.
        </p>
      )}
      <form className="workspace-card community-filters" onSubmit={submit}>
        <div className="community-filter-row">
          <label>
            Search location
            <input
              name="community-location"
              value={filters.location}
              onChange={(e) =>
                setFilters((f) => ({ ...f, location: e.target.value }))
              }
              placeholder="City, state or ZIP"
              maxLength={80}
              required
              aria-describedby="community-location-note"
            />
          </label>
          <label>
            Radius
            <select
              value={filters.radiusMiles}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  radiusMiles: Number(e.target.value),
                }))
              }
            >
              {[5, 10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n} miles
                </option>
              ))}
            </select>
          </label>
          <label>
            Date window
            <select
              value={filters.dateWindowDays}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  dateWindowDays: Number(e.target.value),
                }))
              }
            >
              {[7, 14, 30, 60, 90].map((n) => (
                <option key={n} value={n}>
                  Next {n} days
                </option>
              ))}
            </select>
          </label>
        </div>
        <p id="community-location-note" className="hint">
          Distances are approximate straight-line distances from a city or ZIP
          centroid, never driving distances. Search changes affect this board
          only.
        </p>
        <fieldset>
          <legend>Interests · choose up to 3</legend>
          <div className="community-interests">
            {communityCategory.options.map((c) => (
              <label key={c} className="choice">
                <input
                  type="checkbox"
                  checked={filters.categories.includes(c)}
                  onChange={(e) => category(c, e.target.checked)}
                />
                {COMMUNITY_CATEGORY_LABELS[c]}
              </label>
            ))}
          </div>
          <p className="hint">
            With no selection, Health workshops is the default. Accessibility is
            only claimed when stated by a source.
          </p>
        </fieldset>
        <div className="community-filter-row">
          <label className="choice">
            <input
              type="checkbox"
              checked={filters.freeOnly}
              onChange={(e) =>
                setFilters((f) => ({ ...f, freeOnly: e.target.checked }))
              }
            />
            Free only (explicitly listed)
          </label>
          {me && (
            <label className="choice">
              <input
                type="checkbox"
                checked={saveDefault}
                onChange={(e) => setSaveDefault(e.target.checked)}
              />
              Save as default (updates profile location on search)
            </label>
          )}
        </div>
        <div className="community-actions">
          <button
            className="primary"
            type="submit"
            disabled={pending || !ready}
          >
            {pending ? "Searching…" : "Find opportunities"}
          </button>
          {me && (
            <button
              type="button"
              className="secondary"
              disabled={pending || !ready}
              onClick={() => {
                setSavedOnly(true);
                setNotice(`${savedItems.length} saved opportunities.`);
              }}
            >
              Saved opportunities ({savedItems.length})
            </button>
          )}
          {board && me && (
            <button
              type="button"
              className="secondary"
              disabled={pending}
              onClick={() => void search(filters, true)}
            >
              Refresh sources
            </button>
          )}
        </div>
      </form>
      <div
        className="community-tabs"
        role="group"
        aria-label="Opportunity type"
      >
        {(["event", "ongoing_resource"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={!savedOnly && filters.kind === kind}
            onClick={() => {
              const next = { ...filters, kind };
              setFilters(next);
              void search(next);
            }}
            disabled={pending || !ready}
          >
            {kind === "event" ? "Upcoming events" : "Ongoing resources"}
          </button>
        ))}
      </div>
      <p role="status" aria-live="polite">
        {pending ? "Searching public sources. This may take a moment." : notice}
      </p>
      {error && (
        <div className="banner banner-error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="secondary"
            onClick={() => void search()}
            disabled={pending}
          >
            Retry search
          </button>
        </div>
      )}
      {!me && (
        <p className="muted">
          <button type="button" className="text-button" onClick={onSignIn}>
            Sign in
          </button>{" "}
          to save opportunities or defaults. Registration happens on the
          organizer’s website.
        </p>
      )}
      {pending && (
        <div className="community-grid" aria-hidden="true">
          {[1, 2, 3].map((n) => (
            <div className="workspace-card community-skeleton" key={n}>
              <span />
              <span />
              <span />
            </div>
          ))}
        </div>
      )}
      {!pending && !savedOnly && board && (
        <>
          <div className="community-summary">
            <b>
              {board.status === "unavailable"
                ? "Community sources are unavailable"
                : board.status === "partial"
                  ? "Partial results"
                  : "Source results"}
            </b>
            <span>
              {board.cache.status} · Retrieval {board.providers.retrieval} ·
              Enrichment {board.providers.enrichment} · Geocoding{" "}
              {board.providers.geocoding}
            </span>
            {board.cache.retrievedAt && (
              <span>Retrieved {stamp(board.cache.retrievedAt)}</span>
            )}
            {board.origin && (
              <span>
                Origin: {board.origin.label} (
                {board.origin.accuracy === "zip_centroid" ? "ZIP" : "city"}{" "}
                centroid, {board.origin.dataMode})
              </span>
            )}
          </div>
          {board.warnings.length > 0 && (
            <aside
              className="banner banner-warning"
              aria-label="Community source warnings"
            >
              <ul>
                {board.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </aside>
          )}
          {board.status === "unavailable" && (
            <button
              type="button"
              className="secondary"
              onClick={() => void search()}
            >
              Retry community sources
            </button>
          )}
          {board.providers.retrieval === "fixture" && (
            <p className="banner banner-info">
              Synthetic demo results. These fictional opportunities and
              addresses are not real events.
            </p>
          )}
        </>
      )}
      {!pending && (board || savedOnly) && items.length === 0 && (
        <div className="workspace-card community-empty">
          <h2>
            {savedOnly ? "No saved opportunities" : "No matching opportunities"}
          </h2>
          <p>
            {savedOnly
              ? "Find opportunities and select Save to keep a private list."
              : "Try another interest, a wider date window, or a nearby city. Turning off Free only also includes sources with unknown costs."}
          </p>
        </div>
      )}
      <div className="community-sections">
        {!pending &&
          Object.entries(sections).map(([section, label]) => {
            const group = items.filter((i) => i.section === section);
            return (
              group.length > 0 && (
                <section
                  className="community-section"
                  key={section}
                  aria-labelledby={`community-${section}`}
                >
                  <h2 id={`community-${section}`}>
                    {savedOnly && section === "distance_unverified"
                      ? "Saved opportunities · distance not verified"
                      : label}
                  </h2>
                  {section === "nearby" && (
                    <p className="muted">
                      Within {board?.filters.radiusMiles ?? filters.radiusMiles}{" "}
                      miles of the search centroid, based on geocoded venue
                      addresses.
                    </p>
                  )}
                  {section === "distance_unverified" && (
                    <p className="muted">
                      These sources have not passed the radius check. Confirm
                      the venue with the organizer.
                    </p>
                  )}
                  {section === "date_unverified" && (
                    <p className="muted">
                      These discovery results have incomplete or conflicting
                      dates. They are not confirmed upcoming events.
                    </p>
                  )}
                  <div className="community-grid">
                    {group.map((view) => {
                      const l = view.listing;
                      return (
                        <article
                          className="workspace-card community-card"
                          key={l.id}
                          aria-labelledby={`${l.id}-title`}
                        >
                          <div className="community-card-top">
                            <span className="pill gray">{l.dataMode}</span>
                            <span className="eyebrow">
                              {l.kind === "event"
                                ? "Event"
                                : "Ongoing resource"}
                            </span>
                          </div>
                          <h3 id={`${l.id}-title`}>{l.title}</h3>
                          <p className="muted">
                            {l.organizer ?? "Organizer not listed"}
                          </p>
                          <p className="community-date">
                            {communityDateLabel(l)}
                          </p>
                          {l.kind === "event" && !l.timezone && (
                            <p className="hint">
                              Local timezone not established.
                            </p>
                          )}
                          <p>
                            {l.locationMode === "online"
                              ? "Online"
                              : (l.venueName ?? "Venue not listed")}
                            {l.address && l.locationMode !== "online" && (
                              <>
                                <br />
                                {l.address}
                              </>
                            )}
                          </p>
                          {view.distanceMiles !== null && (
                            <p className="community-distance">
                              Approximately {view.distanceMiles} miles ·
                              straight-line from search centroid
                            </p>
                          )}
                          <p>
                            <b>{l.costText ?? "Cost not listed"}</b>
                          </p>
                          <p>{l.description}</p>
                          {[
                            l.eligibilityText,
                            l.languageInfo,
                            l.accessibilityInfo,
                          ]
                            .filter(Boolean)
                            .map((text, i) => (
                              <p key={i}>{text}</p>
                            ))}
                          {view.matchReasons.map((reason) => (
                            <p className="hint" key={reason}>
                              {reason}
                            </p>
                          ))}
                          <div className="community-links">
                            <a
                              href={l.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              View source
                              <span className="sr-only">
                                {" "}
                                for {l.title} (opens a new tab)
                              </span>
                            </a>
                            {l.registrationUrl && (
                              <a
                                href={l.registrationUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Organizer registration
                                <span className="sr-only">
                                  {" "}
                                  (opens a new tab)
                                </span>
                              </a>
                            )}
                          </div>
                          <p className="hint">
                            Retrieved {stamp(l.retrievedAt)}
                            <br />
                            {l.sourceCheckedAt
                              ? `Source checked ${stamp(l.sourceCheckedAt)}`
                              : "Organizer page not checked. Confirm details before attending."}
                            <br />
                            Enrichment:{" "}
                            {l.enrichmentStatus === "muse"
                              ? "Muse evidence extraction"
                              : l.enrichmentStatus.replace("_", " ")}
                          </p>
                          <details>
                            <summary>Source evidence and uncertainties</summary>
                            {l.sourceEvidence.map((e, i) => (
                              <p key={i}>
                                <b>{e.field}: </b>
                                {e.excerpt}
                              </p>
                            ))}
                            <ul>
                              {l.warnings.map((w) => (
                                <li key={w}>{w}</li>
                              ))}
                            </ul>
                          </details>
                          <div className="community-actions">
                            <button
                              type="button"
                              className="secondary"
                              disabled={busyId === l.id}
                              aria-label={`${view.saved ? "Remove saved" : "Save"} ${l.title}`}
                              onClick={() => void toggleSave(view)}
                            >
                              {view.saved ? "Remove saved" : "Save"}
                            </button>
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => void share(l)}
                            >
                              Copy public link
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              )
            );
          })}
      </div>
      {!board && !pending && !savedOnly && (
        <div className="workspace-card community-empty">
          <h2>Find your next local connection</h2>
          <p>
            Choose a city and up to three interests, then find opportunities.
            Events and ongoing resources are listed separately.
          </p>
        </div>
      )}
      <p className="hint">
        “Confirmed” dates mean supported by retrieved evidence, not organizer
        verification or confirmed attendance. Demo saves expire after seven
        days. Profile defaults follow account retention. All demo state
        disappears on server restart.
      </p>
    </main>
  );
}
