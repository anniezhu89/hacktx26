import { useEffect, useState } from "react";
import type { ReviewRequest } from "@labelbridge/contracts";
import { toApiError } from "../api/client";
import type { WorkspaceClient } from "../api/workspace";
import { FIELD_LABELS } from "../lib/fields";
import { PhotoEditor } from "./PhotoEditor";

/**
 * Lets the patient send a volunteer only the hard-to-read part of their photo.
 * The crop happens in this browser; the server stores and serves only that
 * section, and never the whole label image, to the claiming volunteer.
 */
export function ReviewSectionImage({
  client,
  reviews,
  photoUrl,
}: {
  client: WorkspaceClient;
  reviews: ReviewRequest[] | null;
  photoUrl: string | null;
}) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [section, setSection] = useState<File | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const open = (reviews ?? []).filter(
    (r) => r.status === "pending" && !sent.has(r.id),
  );

  useEffect(() => {
    if (!photoUrl) return setPhoto(null);
    let live = true;
    fetch(photoUrl)
      .then((r) => r.blob())
      .then(
        (b) => live && setPhoto(new File([b], "label.jpg", { type: b.type })),
      )
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [photoUrl]);

  if (!photo || !open.length) return null;
  const target = open[0];

  return (
    <section className="panel" aria-labelledby="section-image-heading">
      <h2 id="section-image-heading">
        Share only the hard-to-read part (optional)
      </h2>
      <p>
        For your request about{" "}
        {target.selectedFields.map((k) => FIELD_LABELS[k]).join(", ")}: trim the
        photo to just that part. The volunteer sees only this section, never
        your name, profile or the automatic reading. You can cancel the request
        until it is answered.
      </p>
      <PhotoEditor
        file={section ?? photo}
        title="Choose the section"
        applyLabel="Use this section"
        onApply={setSection}
      />
      <button
        type="button"
        className="primary fit"
        disabled={!section}
        onClick={() =>
          void client.uploadReviewImage(target.id, section!).then(
            () => {
              setSent((s) => new Set(s).add(target.id));
              setSection(null);
              setMessage("The selected section was attached to your request.");
            },
            (e) => setMessage(toApiError(e).message),
          )
        }
      >
        Send this section with my request
      </button>
      <p className="hint" aria-live="polite">
        {message ??
          (section
            ? "Ready to send the trimmed section."
            : "Trim the photo, then choose “Use this section”.")}
      </p>
    </section>
  );
}
