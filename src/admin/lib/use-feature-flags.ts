import { useQuery } from "@tanstack/react-query"
import { getDefaultFeatureEnabled, WebbersFeatureKey } from "../../feature-flags"
import { sdk } from "./sdk"

type FlagsResponse = { flags: Record<string, boolean> }

export const WEBBERS_SETTINGS_QUERY_KEY = ["webbers-medusa-settings"]

export const useFeatureFlags = () =>
  useQuery<FlagsResponse>({
    queryKey: WEBBERS_SETTINGS_QUERY_KEY,
    queryFn: () => sdk.client.fetch<FlagsResponse>("/admin/webbers-medusa/settings"),
    staleTime: 60_000,
  })

/**
 * Whether a feature is enabled. Falls back to the feature's default while loading or if missing,
 * so enabled widgets do not flicker off before settings finish loading.
 */
export const useFeatureEnabled = (key: WebbersFeatureKey | string): boolean => {
  const { data } = useFeatureFlags()
  return data?.flags?.[key] ?? getDefaultFeatureEnabled(key)
}
