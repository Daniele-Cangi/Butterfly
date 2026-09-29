import { afterEach, describe, expect, it, vi } from "vitest";
import { sanityReadClient } from "../src/sanity/read";

describe("server-side Sanity reader", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the read-only token from a server-only environment variable", () => {
    vi.stubEnv("NEXT_PUBLIC_SANITY_PROJECT_ID", "butterfly-project");
    vi.stubEnv("NEXT_PUBLIC_SANITY_DATASET", "production");
    vi.stubEnv("SANITY_API_READ_TOKEN", "viewer-token-for-test");

    const config = sanityReadClient().config();
    expect(config).toMatchObject({
      projectId: "butterfly-project",
      dataset: "production",
      token: "viewer-token-for-test",
      perspective: "published",
    });
  });

  it("can use anonymous published reads when no read token is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SANITY_PROJECT_ID", "butterfly-project");
    vi.stubEnv("NEXT_PUBLIC_SANITY_DATASET", "production");
    vi.stubEnv("SANITY_API_READ_TOKEN", "");

    expect(sanityReadClient().config().token).toBeUndefined();
  });
});
