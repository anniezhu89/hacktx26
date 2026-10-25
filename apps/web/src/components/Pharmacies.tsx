import { useState, type FormEvent } from "react";
import { coarseLocation, type Case } from "@labelbridge/contracts";
import type { ApiClient, PharmacyData } from "../api/client";
import { DATA_MODE_TEXT } from "../lib/dataMode";
import { useRevisionResult } from "../state/useRevisionResult";
import { ErrorBanner } from "./ErrorBanner";

/** Digits only in a phone link; the display text stays exactly as supplied. */
const telHref = (phone: string) => {
  const digits = phone.replace(/[^\d+]/g, "");
  return digits.length >= 7 ? `tel:${digits}` : null;
};

const when = (iso: string) =>
  new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export function Pharmacies({
  api,
  caseData,
}: {
  api: ApiClient;
  caseData: Case;
}) {
  // Keyed on the case alone: the lookup uses the location only, so a field
  // edit must not discard a list that is still perfectly valid.
  const result = useRevisionResult<PharmacyData>(caseData.id, 0);
  const [location, setLocation] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  function submit(event: FormEvent) {
    event.preventDefault();
    // The same schema the server enforces, so a street address is caught in
    // the browser and never sent to the search provider at all.
    const parsed = coarseLocation.safeParse(location);
    if (!parsed.success) {
      setErrors([
        "Enter a 5-digit ZIP code or a city name. Do not enter a street address.",
      ]);
      return;
    }
    setErrors([]);
    void result.request((signal) =>
      api.findPharmacies(caseData.id, { location: parsed.data }, signal),
    );
  }

  const data = result.data;

  return (
    <section aria-labelledby="pharmacies-heading" className="panel stack-sm">
      <h2 id="pharmacies-heading">Find a pharmacy nearby</h2>
      <p>
        Pharmacies listed near a ZIP code or city, from a public map source.
        Only the place you type is sent to that source: nothing from your label
        and nothing about your medication.
      </p>
      <form noValidate onSubmit={submit} className="stack-sm">
        <div className="stack-sm">
          <label htmlFor="pharmacy-location" className="field-label">
            ZIP code or city
          </label>
          <input
            id="pharmacy-location"
            type="text"
            maxLength={60}
            autoComplete="postal-code"
            value={location}
            aria-describedby="pharmacy-location-hint"
            onChange={(e) => setLocation(e.target.value)}
          />
          <p id="pharmacy-location-hint" className="hint">
            For example 78751, or Austin. Do not enter a street address: a rough
            area is all this needs.
          </p>
        </div>
        {errors.length > 0 && (
          <div className="banner banner-error" role="alert">
            <ul>
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        <button type="submit" className="primary" disabled={result.pending}>
          {result.pending ? "Searching…" : "Find pharmacies"}
        </button>
      </form>

      <div aria-live="polite">
        {result.pending && <p className="hint">Searching the map source…</p>}
        {data?.status === "location_not_recognised" && (
          <p className="banner banner-blocked">
            That location was not recognised, so no pharmacies are shown. Check
            the ZIP code, or try the name of a nearby city.
          </p>
        )}
        {data?.status === "no_results" && (
          <p>
            No pharmacies were listed for that location. Try a nearby city, or
            ask whoever filled this prescription where to collect it.
          </p>
        )}
      </div>

      {result.error?.error.code === "PROVIDER_UNAVAILABLE" ? (
        <p className="banner banner-info">
          Pharmacy search is unavailable on this server, so no list can be
          shown. Nothing was guessed.
        </p>
      ) : (
        result.error && (
          <ErrorBanner error={result.error} retrying={result.pending} />
        )
      )}

      {data?.status === "ok" && (
        <>
          {result.dataMode && (
            <p className="badge">{DATA_MODE_TEXT[result.dataMode]}</p>
          )}
          <p className="meta">
            {data.sourceTitle} · Retrieved {when(data.retrievedAt)} · Near{" "}
            {data.locationQuery}
          </p>
          <ul>
            {data.notes.map((note) => (
              <li key={note} className="hint">
                {note}
              </li>
            ))}
          </ul>
          <ul
            className="review-list"
            aria-label={`Pharmacies near ${data.locationQuery}`}
          >
            {data.results.map((p) => {
              const tel = p.phone ? telHref(p.phone) : null;
              return (
                <li key={p.id} className="review-card">
                  <h5>{p.name}</h5>
                  <p>{p.address}</p>
                  {p.hoursText && (
                    <p className="meta">
                      Hours as listed by the source: {p.hoursText}
                    </p>
                  )}
                  {p.phone && (
                    <p>
                      {tel ? <a href={tel}>{p.phone}</a> : p.phone}
                      <span className="sr-only"> telephone for {p.name}</span>
                    </p>
                  )}
                  {p.website && (
                    <a
                      href={p.website}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open website<span className="sr-only">: {p.name}</span>
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
