import { useEffect, useId, useState } from "react";
import type { LabelField } from "../lib/fields";

type Crop = NonNullable<LabelField["crop"]>;

// Very wide crops (a line of directions) would otherwise render a few pixels tall.
const MAX_ASPECT = 4;

/** Shows only the cropped region (normalized 0–1 coordinates) of an image. */
export function ImageExcerpt({
  src,
  crop,
  label,
}: {
  src: string;
  crop: Crop;
  label: string;
}) {
  // Letterboxing from MAX_ASPECT would otherwise show image outside the crop.
  const clipId = `excerpt-${useId().replace(/[^\w-]/g, "")}`;
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    let live = true;
    const probe = new Image();
    probe.onload = () => {
      if (live && probe.naturalWidth && probe.naturalHeight)
        setSize({ w: probe.naturalWidth, h: probe.naturalHeight });
    };
    probe.src = src;
    return () => {
      live = false;
    };
  }, [src]);
  if (!size || crop.width <= 0 || crop.height <= 0) return null;
  const box = [
    crop.x * size.w,
    crop.y * size.h,
    crop.width * size.w,
    crop.height * size.h,
  ];
  return (
    <svg
      className="excerpt"
      role="img"
      aria-label={label}
      viewBox={box.join(" ")}
      preserveAspectRatio="xMidYMid meet"
      style={{ aspectRatio: `${Math.min(box[2] / box[3], MAX_ASPECT)}` }}
    >
      <clipPath id={clipId}>
        <rect x={box[0]} y={box[1]} width={box[2]} height={box[3]} />
      </clipPath>
      <image
        href={src}
        width={size.w}
        height={size.h}
        clipPath={`url(#${clipId})`}
      />
    </svg>
  );
}
