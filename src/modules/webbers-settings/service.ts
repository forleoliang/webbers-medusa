import { MedusaService } from '@medusajs/framework/utils';
import { FeatureFlag } from './models/feature-flag';
import {
  getDefaultFeatureEnabled,
  WEBBERS_FEATURE_KEYS,
  WebbersFeatureKey,
} from '../../feature-flags';
import { WebbersMedusaOptions } from '../../options';

class WebbersSettingsService extends MedusaService({ FeatureFlag }) {
  // Plugin options passed by the host app in medusa-config.ts propagate to this module.
  protected readonly options_: WebbersMedusaOptions;

  constructor(container: unknown, options?: WebbersMedusaOptions) {
    // eslint-disable-next-line prefer-rest-params
    super(...arguments);
    this.options_ = options ?? {};
  }

  /** Host-configured extra tables for the customer anonymize routine. */
  getAnonymizeConfig(): NonNullable<WebbersMedusaOptions['anonymize']> {
    return this.options_.anonymize ?? {};
  }

  /** Host-configured extra tables for the edit-customer-email routine. */
  getEditEmailConfig(): NonNullable<WebbersMedusaOptions['editEmail']> {
    return this.options_.editEmail ?? {};
  }

  /** Returns every known feature key mapped to its enabled state. */
  async getFlags(): Promise<Record<string, boolean>> {
    const rows = await this.listFeatureFlags({}, { take: null });

    const map: Record<string, boolean> = {};
    for (const key of WEBBERS_FEATURE_KEYS) {
      map[key] = getDefaultFeatureEnabled(key);
    }
    for (const row of rows) {
      map[row.key] = row.enabled;
    }
    return map;
  }

  /** Whether a single feature is enabled (uses feature definition default when no row exists). */
  async isEnabled(key: WebbersFeatureKey | string): Promise<boolean> {
    const [existing] = await this.listFeatureFlags({ key }, { take: 1 });
    return existing ? existing.enabled : getDefaultFeatureEnabled(key);
  }

  /** Upsert a feature flag. */
  async setFlag(key: WebbersFeatureKey, enabled: boolean) {
    const [existing] = await this.listFeatureFlags({ key }, { take: 1 });
    if (existing) {
      return this.updateFeatureFlags({ id: existing.id, enabled });
    }
    return this.createFeatureFlags({ key, enabled });
  }
}

export default WebbersSettingsService;
