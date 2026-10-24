// Minimal synthetic image headers: enough structure for signature and
// dimension checks, with no real image content.
export function syntheticPng(width: number, height: number) {
  const header = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header);
  header.writeUInt32BE(13, 8);
  header.write("IHDR", 12, "latin1");
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  header.set([8, 2, 0, 0, 0], 24);
  return header;
}

export function syntheticJpeg(width: number, height: number) {
  const app0 = [
    0xff,
    0xe0,
    0x00,
    0x10,
    ...Buffer.from("JFIF\0"),
    1,
    1,
    0,
    0,
    1,
    0,
    1,
    0,
    0,
  ];
  const sof = [
    0xff,
    0xc0,
    0x00,
    0x11,
    8,
    height >> 8,
    height & 255,
    width >> 8,
    width & 255,
    3,
  ];
  return Buffer.from([
    0xff,
    0xd8,
    ...app0,
    ...sof,
    1,
    0x22,
    0,
    2,
    0x11,
    1,
    3,
    0x11,
    1,
    0xff,
    0xd9,
  ]);
}
