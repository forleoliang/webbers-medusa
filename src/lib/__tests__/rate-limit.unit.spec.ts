import { Modules } from "@medusajs/framework/utils"
import { rateLimit, resetRateLimits } from "../rate-limit"

const memoryContainer = { resolve: () => { throw new Error("no cache") } } as never

describe("rateLimit (in-memory fallback)", () => {
  beforeEach(() => resetRateLimits())
  it("allows max requests per window, then throws 429-style", async () => {
    for (let i = 0; i < 3; i++) await expect(rateLimit(memoryContainer, "k", 3, 60)).resolves.toBeUndefined()
    await expect(rateLimit(memoryContainer, "k", 3, 60)).rejects.toMatchObject({ type: "not_allowed", code: "RATE_LIMITED" })
    await expect(rateLimit(memoryContainer, "other", 3, 60)).resolves.toBeUndefined()
  })
  it("0 disables", async () => {
    for (let i = 0; i < 20; i++) await expect(rateLimit(memoryContainer, "k", 0, 60)).resolves.toBeUndefined()
  })
  it("uses Modules.CACHING when the container has it", async () => {
    const store = new Map<string, unknown>()
    const container = {
      resolve: (token: string) => {
        if (token !== Modules.CACHING) throw new Error("unexpected module")
        return {
          get: async ({ key }: { key: string }) => store.get(key) ?? null,
          set: async ({ key, data }: { key: string; data: unknown }) => void store.set(key, data),
        }
      },
    } as never
    await rateLimit(container, "c", 2, 60)
    await rateLimit(container, "c", 2, 60)
    await expect(rateLimit(container, "c", 2, 60)).rejects.toBeTruthy()
    expect([...store.keys()][0]).toMatch(/^rw:rl:c:\d+$/)
  })
  it("falls back to legacy Modules.CACHE when Modules.CACHING is unavailable", async () => {
    const store = new Map<string, unknown>()
    const container = {
      resolve: (token: string) => {
        if (token !== Modules.CACHE) throw new Error("no caching module")
        return { get: async (k: string) => store.get(k) ?? null, set: async (k: string, v: unknown) => void store.set(k, v) }
      },
    } as never
    await rateLimit(container, "legacy", 2, 60)
    await rateLimit(container, "legacy", 2, 60)
    await expect(rateLimit(container, "legacy", 2, 60)).rejects.toBeTruthy()
    expect([...store.keys()][0]).toMatch(/^rw:rl:legacy:\d+$/)
  })
})
