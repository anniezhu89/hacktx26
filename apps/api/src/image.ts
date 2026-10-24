import { ApiError } from "./errors";

export const maxImageBytes = 5 * 1024 * 1024;
const maxSide = 8000;
const maxPixels = 40_000_000;
const minSide = 32;

export type ValidatedImage = {
  bytes: Buffer;
  mime: "image/png" | "image/jpeg";
  width: number;
  height: number;
};

const pngSignature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function pngSize(bytes: Buffer) {
  if (bytes.length < 24 || bytes.toString("latin1", 12, 16) !== "IHDR")
    return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

// Walks JPEG segments to the first start-of-frame marker; SOF markers are
// C0-CF except C4 (huffman), C8 (reserved) and CC (arithmetic coding).
function jpegSize(bytes: Buffer) {
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) return null;
    const isFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isFrame) {
      if (offset + 9 > bytes.length) return null;
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return null;
}

// Validates actual file contents; client-declared names and types are ignored.
export function validateImage(bytes: Buffer): ValidatedImage {
  if (bytes.length > maxImageBytes)
    throw new ApiError("IMAGE_TOO_LARGE", "Image exceeds the 5 MB limit.");
  let mime: ValidatedImage["mime"];
  let size: { width: number; height: number } | null;
  if (bytes.subarray(0, 8).equals(pngSignature)) {
    mime = "image/png";
    size = pngSize(bytes);
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    mime = "image/jpeg";
    size = jpegSize(bytes);
  } else
    throw new ApiError(
      "UNSUPPORTED_IMAGE",
      "Only PNG and JPEG images are accepted.",
    );
  if (!size)
    throw new ApiError(
      "UNSUPPORTED_IMAGE",
      "Image dimensions could not be read; the file may be damaged.",
    );
  const { width, height } = size;
  if (
    width < minSide ||
    height < minSide ||
    width > maxSide ||
    height > maxSide ||
    width * height > maxPixels
  )
    throw new ApiError(
      "UNSUPPORTED_IMAGE",
      `Image dimensions must be between ${minSide} and ${maxSide} pixels per side.`,
    );
  return { bytes, mime, width, height };
}
