import type { FieldKey, LabelLine } from "../domain/types";
import { cx } from "./ui";

export function LabelFace({
  lines,
  imageUrl,
  imageAlt,
  activeKey,
  onPick,
  compact = false,
}: {
  lines: LabelLine[];
  imageUrl: string | null;
  imageAlt: string;
  activeKey?: FieldKey | null;
  onPick?: (key: FieldKey) => void;
  compact?: boolean;
}) {
  return (
    <figure className={cx("lb-vial", compact && "is-compact")}>
      <div className="lb-vial-top">
        <span>Demo Pharmacy</span>
        <span>Fictional</span>
      </div>
      {imageUrl ? (
        <img src={imageUrl} alt={imageAlt} />
      ) : (
        lines.map((item, index) => {
          const className = cx(
            "lb-vial-line",
            item.key === "medicationName" && "is-name",
            item.key != null && item.key === activeKey && "is-active",
          );
          const body = item.unreadable ? <span className="lb-smudge">Unreadable</span> : item.text;
          if (onPick && item.key) {
            const key = item.key;
            return (
              <button key={`${item.key}-${index}`} type="button" className={className} onClick={() => onPick(key)}>
                {body}
              </button>
            );
          }
          return (
            <div key={`${item.text}-${index}`} className={className}>
              {body}
            </div>
          );
        })
      )}
      <figcaption className="lb-faint">Fictional sample. Not a real prescription.</figcaption>
    </figure>
  );
}
