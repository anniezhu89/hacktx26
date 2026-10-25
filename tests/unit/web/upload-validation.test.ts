import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../../../apps/api/src/app";
import {
  ApiError,
  createHttpClient,
  type ApiClient,
} from "../../../apps/web/src/api/client";
import {
  sniffImageFormat,
  validateImageFile,
} from "../../../apps/web/src/lib/fields";
import { uploadErrorMessage } from "../../../apps/web/src/lib/intake";
import { syntheticJpeg, syntheticPng } from "../api/images";

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(
    parts.flatMap((p) =>
      typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p,
    ),
  );
const file = (data: Uint8Array | Buffer, name: string, type = "") =>
  new File([new Uint8Array(data)], name, { type });

const png = syntheticPng(640, 480);
const jpeg = syntheticJpeg(800, 600);

describe("image format detection reads the file's bytes", () => {
  it("recognises PNG and JPEG signatures exactly", () => {
    expect(sniffImageFormat(new Uint8Array(png))).toBe("png");
    expect(sniffImageFormat(new Uint8Array(jpeg))).toBe("jpeg");
    // One wrong byte in the PNG signature is not a PNG.
    const bad = new Uint8Array(png.subarray(0, 16));
    bad[4] = 0x0a;
    expect(sniffImageFormat(bad)).toBe("unknown");
  });

  it("names the common formats that arrive with a .png name", () => {
    expect(sniffImageFormat(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 "))).toBe(
      "webp",
    );
    expect(sniffImageFormat(bytes("GIF89a"))).toBe("gif");
    expect(sniffImageFormat(bytes([0, 0, 0, 0x24], "ftypheic"))).toBe("heic");
    expect(sniffImageFormat(bytes([0, 0, 0, 0x20], "ftypavif"))).toBe("avif");
    expect(sniffImageFormat(bytes("%PDF-1.7"))).toBe("pdf");
    expect(sniffImageFormat(bytes([0xef, 0xbb, 0xbf], "  <svg"))).toBe(
      "markup",
    );
  });
});

describe("browser-side upload validation", () => {
  it("accepts real PNG and JPEG bytes whatever the name or MIME type says", async () => {
    // Regression: a genuine PNG was rejected when the browser gave no MIME type.
    expect(await validateImageFile(file(png, "label"))).toBeNull();
    expect(
      await validateImageFile(file(png, "label.png", "image/png")),
    ).toBeNull();
    expect(
      await validateImageFile(file(jpeg, "label.jpg", "image/jpeg")),
    ).toBeNull();
    expect(
      await validateImageFile(file(jpeg, "label.png", "image/png")),
    ).toBeNull();
  });

  it("says what a mislabelled file really is, without blaming the photo", async () => {
    const webp = bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 ");
    const message = await validateImageFile(
      file(webp, "label.png", "image/png"),
    );
    expect(message).toMatch(/WebP image, not a PNG or JPEG/);
    expect(message).toMatch(/name ends in \.png/);
    const heic = await validateImageFile(
      file(bytes([0, 0, 0, 0x24], "ftypheic"), "IMG_0001.png", "image/png"),
    );
    expect(heic).toMatch(/HEIC photo/);
    const unknown = await validateImageFile(
      file(bytes("just some text bytes"), "label.png", "image/png"),
    );
    expect(unknown).toMatch(/not PNG or JPEG image data/);
    for (const m of [message, heic, unknown])
      expect(m).not.toMatch(/taking a new photo/i);
  });

  it("rejects empty and oversized files with their own reasons", async () => {
    expect(await validateImageFile(file(new Uint8Array(), "e.png"))).toMatch(
      /empty \(0 bytes\)/,
    );
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(png.subarray(0, 8));
    expect(await validateImageFile(file(big, "big.png", "image/png"))).toMatch(
      /6\.0 MB|5\.0 MB/,
    );
  });
});

describe("upload through the real API", () => {
  let server: Server;
  let client: ApiClient;

  beforeAll(async () => {
    const app = createApp(undefined, {
      log: () => {},
      extraction: null,
      search: null,
    });
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    let cookie = "";
    client = createHttpClient((async (url: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      if (cookie) headers.set("cookie", cookie);
      const res = await fetch(base + url, { ...init, headers });
      const set = res.headers.getSetCookie();
      if (set.length) cookie = set[0].split(";")[0];
      return res;
    }) as typeof fetch);
  });

  afterAll(() => new Promise<void>((done) => server.close(() => done())));

  it("sends PNG and JPEG as multipart and gets a case back", async () => {
    for (const [data, name, type] of [
      [png, "label.png", "image/png"],
      [jpeg, "label.jpg", "image/jpeg"],
    ] as const) {
      const result = await client.createCase({
        kind: "image",
        file: file(data, name, type),
      });
      expect(result.case.revision).toBe(0);
      // Fixture mode cannot read the photo: every field stays unknown.
      for (const f of result.case.fields)
        expect(f).toMatchObject({ value: null, reviewState: "unresolved" });
    }
  });

  it("server rejects a damaged PNG and the UI words it as a damaged photo", async () => {
    const damaged = await client
      .createCase({
        kind: "image",
        file: file(png.subarray(0, 16), "label.png", "image/png"),
      })
      .catch((e) => e);
    expect(damaged).toBeInstanceOf(ApiError);
    expect(damaged).toMatchObject({ code: "UNSUPPORTED_IMAGE", status: 415 });
    expect(uploadErrorMessage(damaged)).toMatch(
      /could not use this photo: .*damaged.* Choose a different PNG or JPEG/,
    );
    expect(
      uploadErrorMessage({ code: "PROVIDER_UNAVAILABLE", message: "x" }),
    ).toBeNull();
  });
});
