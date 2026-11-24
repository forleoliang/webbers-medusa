import en from "../admin/i18n/json/en.json"
import id from "../admin/i18n/json/id.json"
import zhCN from "../admin/i18n/json/zhCN.json"
import zhTW from "../admin/i18n/json/zhTW.json"
import { WEBBERS_FEATURE_KEYS } from "../feature-flags"

function flatten(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flatten(v as Record<string, unknown>, key))
    } else {
      out[key] = String(v ?? "")
    }
  }
  return out
}

function placeholders(str: string): string[] {
  return [...str.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()
}

describe("admin i18n dictionaries", () => {
  const base = flatten(en as unknown as Record<string, unknown>)
  const locales = { zhCN, zhTW, id } as const

  it("includes every feature flag key in all locales", () => {
    for (const key of WEBBERS_FEATURE_KEYS) {
      expect(base[`extensions.settings.features.${key}.label`]).toBeTruthy()
      expect(base[`extensions.settings.features.${key}.description`]).toBeTruthy()
    }
  })

  it.each(Object.entries(locales))(
    "%s has 100% key and interpolation parity with en.json",
    (_locale, json) => {
      const flat = flatten(json as unknown as Record<string, unknown>)
      expect(Object.keys(flat).sort()).toEqual(Object.keys(base).sort())
      for (const [key, enVal] of Object.entries(base)) {
        const val = flat[key]
        expect(val.trim().length).toBeGreaterThan(0)
        expect(placeholders(val)).toEqual(placeholders(enVal))
      }
    }
  )
})
