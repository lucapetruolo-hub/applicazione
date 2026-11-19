import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCloudinaryPhoto } from "./cloudinary-photo";

/** Solo dal nostro cloud, con la foto ridotta (docs/changelog/2026-11-19-foto-recensioni-in-home.md). */
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function stubFetch() {
  const fetchMock = vi.fn().mockResolvedValue(new Response(Buffer.from("img")));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("fetchCloudinaryPhoto", () => {
  it("foto: chiede la versione ridotta in JPEG", async () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "demo");
    const fetchMock = stubFetch();
    expect(await fetchCloudinaryPhoto("https://res.cloudinary.com/demo/image/upload/v1/a/b.png?x=1")).toEqual(Buffer.from("img"));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://res.cloudinary.com/demo/image/upload/c_limit,w_1000,h_1000,q_70,f_jpg/v1/a/b.png");
  });

  it("video: fotogramma iniziale in JPEG", async () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "demo");
    const fetchMock = stubFetch();
    await fetchCloudinaryPhoto("https://res.cloudinary.com/demo/video/upload/v1/c.mp4");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://res.cloudinary.com/demo/video/upload/c_limit,w_1000,h_1000,q_70,f_jpg,so_0/v1/c.jpg");
  });

  it("mai da un altro indirizzo o da un altro cloud", async () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "demo");
    const fetchMock = stubFetch();
    expect(await fetchCloudinaryPhoto("https://example.com/demo/image/upload/a.jpg")).toBeNull();
    expect(await fetchCloudinaryPhoto("https://res.cloudinary.com/altro/image/upload/a.jpg")).toBeNull();
    expect(await fetchCloudinaryPhoto("https://res.cloudinary.com/demo/raw/upload/a.pdf")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
