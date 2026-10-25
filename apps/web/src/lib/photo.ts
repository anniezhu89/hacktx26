import { MAX_IMAGE_BYTES, sniffImageFormat, validateImageFile } from "./fields";

// Same limits the server applies after upload (apps/api/src/image.ts).
export const MIN_SIDE = 32;
export const MAX_SIDE = 8000;
export const MAX_PIXELS = 40_000_000;

export type Crop = { top: number; right: number; bottom: number; left: number };
export const NO_CROP: Crop = { top: 0, right: 0, bottom: 0, left: 0 };

export type PhotoProblem = {
  kind: "format" | "damaged" | "dimensions" | "size" | "heic";
  message: string;
};

/** Problems with decoded dimensions, or null when the server would accept them. */
export function dimensionProblem(
  width: number,
  height: number,
): PhotoProblem | null {
  if (width < MIN_SIDE || height < MIN_SIDE)
    return {
      kind: "dimensions",
      message: `This image is only ${width}×${height} pixels. Use a photo at least ${MIN_SIDE} pixels on each side.`,
    };
  if (width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_PIXELS)
    return {
      kind: "dimensions",
      message: `This image is ${width}×${height} pixels, larger than the ${MAX_SIDE}-pixel limit. Crop it or take a smaller photo.`,
    };
  return null;
}

/** Output pixel box for a crop given in percent of each side (0–45). */
export function cropBox(width: number, height: number, crop: Crop) {
  const clamp = (v: number) => Math.min(45, Math.max(0, v));
  const left = Math.round((clamp(crop.left) / 100) * width);
  const right = Math.round((clamp(crop.right) / 100) * width);
  const top = Math.round((clamp(crop.top) / 100) * height);
  const bottom = Math.round((clamp(crop.bottom) / 100) * height);
  return {
    x: left,
    y: top,
    width: Math.max(1, width - left - right),
    height: Math.max(1, height - top - bottom),
  };
}

/** Canvas size after a quarter-turn rotation. */
export const rotatedSize = (
  width: number,
  height: number,
  quarterTurns: number,
) =>
  quarterTurns % 2 === 0 ? { width, height } : { width: height, height: width };

const jpegName = (name: string) =>
  `${name.replace(/\.[a-z0-9]+$/i, "") || "label"}.jpg`;

/** Decodes with EXIF orientation applied, so the preview and output match. */
async function decode(file: Blob) {
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

async function encode(
  bitmap: ImageBitmap,
  quarterTurns: number,
  crop: Crop,
  name: string,
) {
  const box = cropBox(bitmap.width, bitmap.height, crop);
  const out = rotatedSize(box.width, box.height, quarterTurns);
  const canvas = document.createElement("canvas");
  canvas.width = out.width;
  canvas.height = out.height;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("no canvas");
  g.translate(out.width / 2, out.height / 2);
  g.rotate((quarterTurns * Math.PI) / 2);
  g.drawImage(
    bitmap,
    box.x,
    box.y,
    box.width,
    box.height,
    -box.width / 2,
    -box.height / 2,
    box.width,
    box.height,
  );
  const blob = await new Promise<Blob | null>((r) =>
    canvas.toBlob(r, "image/jpeg", 0.9),
  );
  if (!blob) throw new Error("encode failed");
  // Re-encoding drops metadata such as location; the bytes are a real JPEG.
  return new File([blob], jpegName(name), { type: "image/jpeg" });
}

export type PreparedPhoto = {
  file: File;
  width: number;
  height: number;
  converted: boolean;
};

/**
 * Turns a chosen file into an uploadable PNG/JPEG. HEIC/HEIF is converted only
 * when this browser can actually decode it; otherwise the patient is told how
 * to get a JPEG. Bytes are never renamed to pass a check.
 */
export async function preparePhoto(
  file: File,
): Promise<PreparedPhoto | PhotoProblem> {
  if (file.size === 0)
    return {
      kind: "size",
      message: "That file is empty (0 bytes). Choose a PNG or JPEG image.",
    };
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const format = sniffImageFormat(head);
  if (format === "heic" || format === "avif") {
    let bitmap: ImageBitmap;
    try {
      bitmap = await decode(file);
    } catch {
      return {
        kind: "heic",
        message: `This browser cannot convert ${format === "heic" ? "HEIC/HEIF photos (the iPhone camera format)" : "AVIF images"}. On iPhone, choose Settings → Camera → Formats → Most Compatible, or share the photo as JPEG, then choose that copy.`,
      };
    }
    const problem = dimensionProblem(bitmap.width, bitmap.height);
    if (problem) return problem;
    const converted = await encode(bitmap, 0, NO_CROP, file.name);
    if (converted.size > MAX_IMAGE_BYTES)
      return {
        kind: "size",
        message:
          "The converted photo is larger than 5 MB. Crop it or take a smaller photo.",
      };
    return {
      file: converted,
      width: bitmap.width,
      height: bitmap.height,
      converted: true,
    };
  }
  const invalid = await validateImageFile(file);
  if (invalid)
    return {
      kind: format === "png" || format === "jpeg" ? "size" : "format",
      message: invalid,
    };
  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(file);
  } catch {
    return {
      kind: "damaged",
      message:
        "This PNG or JPEG could not be opened; the file may be damaged or incomplete. Choose another copy of the photo.",
    };
  }
  const problem = dimensionProblem(bitmap.width, bitmap.height);
  return (
    problem ?? {
      file,
      width: bitmap.width,
      height: bitmap.height,
      converted: false,
    }
  );
}

/** Applies rotation and crop, producing a new JPEG. */
export async function editPhoto(
  file: File,
  quarterTurns: number,
  crop: Crop,
): Promise<PreparedPhoto | PhotoProblem> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(file);
  } catch {
    return {
      kind: "damaged",
      message: "This photo could not be opened for editing.",
    };
  }
  const edited = await encode(
    bitmap,
    ((quarterTurns % 4) + 4) % 4,
    crop,
    file.name,
  );
  const out = rotatedSize(
    cropBox(bitmap.width, bitmap.height, crop).width,
    cropBox(bitmap.width, bitmap.height, crop).height,
    quarterTurns,
  );
  const problem = dimensionProblem(out.width, out.height);
  if (problem) return problem;
  if (edited.size > MAX_IMAGE_BYTES)
    return { kind: "size", message: "The edited photo is larger than 5 MB." };
  return { file: edited, ...out, converted: false };
}

export const isProblem = (v: PreparedPhoto | PhotoProblem): v is PhotoProblem =>
  "kind" in v;
