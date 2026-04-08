import { expect, type Locator, type Page } from "@playwright/test";

export const EXPECTED_CHANNELS = [
  "general",
  "dev",
  "tasks",
  "alerts",
] as const;

export type ExpectedChannel = (typeof EXPECTED_CHANNELS)[number];

export function channelRows(page: Page): Locator {
  return page.locator('[data-testid^="channel-item-"]:visible');
}

export function channelRow(page: Page, channel: ExpectedChannel): Locator {
  return page.locator(`[data-testid="channel-item-${channel}"]:visible`);
}

export async function expectDeterministicChannelRows(page: Page): Promise<void> {
  const rows = channelRows(page);

  for (const channel of EXPECTED_CHANNELS) {
    const row = channelRow(page, channel);
    await expect(row).toHaveCount(1);
    await expect(row).toBeVisible();
  }

  // Guard against strict-mode ambiguity from plain text selectors.
  await expect(rows.filter({ hasText: /^general$/ })).toHaveCount(0);
}
