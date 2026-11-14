import { DateTime } from "luxon";
import { MomentRecurrence } from "@prisma/client";

export interface CampaignScheduleShape {
  startDate: Date;
  endDate?: Date | null;
  recurrenceRule: MomentRecurrence;
  customIntervalDays?: number | null;
}

const isLeapYear = (year: number) =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

const getMonthDelta = (from: DateTime, to: DateTime) =>
  (to.year - from.year) * 12 + (to.month - from.month);

const resolveRecurringDay = (anchorDay: number, target: DateTime) =>
  Math.min(anchorDay, target.daysInMonth || 31);

/** True when `orgNow`'s calendar day is a send day for this campaign. */
export function isCampaignDueOn(
  campaign: CampaignScheduleShape,
  orgNow: DateTime
): boolean {
  const start = DateTime.fromJSDate(campaign.startDate, {
    zone: orgNow.zone,
  }).startOf("day");
  const today = orgNow.startOf("day");

  if (campaign.endDate) {
    const end = DateTime.fromJSDate(campaign.endDate, {
      zone: orgNow.zone,
    }).startOf("day");
    if (today > end) return false;
  }

  if (campaign.recurrenceRule === MomentRecurrence.ONE_TIME) {
    return start.toISODate() === today.toISODate();
  }

  if (start > today) return false;

  if (campaign.recurrenceRule === MomentRecurrence.ANNUAL) {
    if (start.month === 2 && start.day === 29 && !isLeapYear(today.year)) {
      return today.month === 2 && today.day === 28;
    }
    return start.month === today.month && start.day === today.day;
  }

  if (campaign.recurrenceRule === MomentRecurrence.DAILY) return true;

  if (
    campaign.recurrenceRule === MomentRecurrence.MONTHLY ||
    campaign.recurrenceRule === MomentRecurrence.QUARTERLY ||
    campaign.recurrenceRule === MomentRecurrence.BI_YEARLY
  ) {
    const monthDelta = getMonthDelta(start, today);
    if (monthDelta < 0) return false;
    const interval =
      campaign.recurrenceRule === MomentRecurrence.MONTHLY
        ? 1
        : campaign.recurrenceRule === MomentRecurrence.QUARTERLY
          ? 3
          : 6;
    if (monthDelta % interval !== 0) return false;
    return today.day === resolveRecurringDay(start.day, today);
  }

  if (campaign.recurrenceRule === MomentRecurrence.CUSTOM) {
    const intervalDays = campaign.customIntervalDays;
    if (!intervalDays || intervalDays < 1) return false;
    const elapsedDays = Math.floor(today.diff(start, "days").days);
    return elapsedDays >= 0 && elapsedDays % intervalDays === 0;
  }

  return false;
}

export function nextCampaignRuns(
  campaign: CampaignScheduleShape & { sendHour: number; sendMinute: number },
  from: DateTime,
  count = 3,
  maxDaysAhead = 800
): DateTime[] {
  const runs: DateTime[] = [];
  let cursor = from.startOf("day");

  for (let i = 0; i <= maxDaysAhead && runs.length < count; i++) {
    const day = cursor.plus({ days: i });
    if (!isCampaignDueOn(campaign, day)) continue;
    const at = day.set({
      hour: campaign.sendHour,
      minute: campaign.sendMinute,
      second: 0,
      millisecond: 0,
    });
    if (at < from) continue; // today's slot already passed
    runs.push(at);
  }

  return runs;
}

export const SUPPORTED_CAMPAIGN_RECURRENCES: MomentRecurrence[] = [
  MomentRecurrence.ONE_TIME,
  MomentRecurrence.DAILY,
  MomentRecurrence.MONTHLY,
  MomentRecurrence.QUARTERLY,
  MomentRecurrence.BI_YEARLY,
  MomentRecurrence.ANNUAL,
  MomentRecurrence.CUSTOM,
];
