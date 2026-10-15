// Daily purple sky (ADR-0069): 2:02 to 2:22 pm US Central time, the same moment for every player.

export const PURPLE_SKY_TIMEZONE = 'America/Chicago';
/** Minutes after local midnight in PURPLE_SKY_TIMEZONE: start inclusive, end exclusive. */
export const PURPLE_SKY_START_MIN = 14 * 60 + 2;
export const PURPLE_SKY_END_MIN = 14 * 60 + 22;
/** How often the world checks the clock, so the sky flips during play. */
export const PURPLE_SKY_CHECK_MS = 1000;

const centralClock = new Intl.DateTimeFormat('en-US', {
  timeZone: PURPLE_SKY_TIMEZONE,
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
});

/** True during the daily purple-sky window. Follows daylight saving via the IANA zone. */
export function isPurpleSkyTime(now: Date = new Date()): boolean {
  let hour = 0;
  let minute = 0;
  for (const p of centralClock.formatToParts(now)) {
    if (p.type === 'hour') hour = Number(p.value);
    else if (p.type === 'minute') minute = Number(p.value);
  }
  const m = hour * 60 + minute;
  return m >= PURPLE_SKY_START_MIN && m < PURPLE_SKY_END_MIN;
}
