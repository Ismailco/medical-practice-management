import "server-only";

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

import { env } from "@/config/env";
import { InvalidAppointmentTimeError } from "./errors";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isCalendarDate(value: string): boolean {
  if (!datePattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function nextCalendarDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function localDateTimeToInstant(
  date: string,
  time: string,
  timeZone = env.CLINIC_TIMEZONE,
): Date {
  if (!isCalendarDate(date) || !timePattern.test(time)) {
    throw new InvalidAppointmentTimeError();
  }

  const localValue = `${date}T${time}`;
  const instant = fromZonedTime(`${localValue}:00`, timeZone);
  if (
    Number.isNaN(instant.valueOf()) ||
    formatInTimeZone(instant, timeZone, "yyyy-MM-dd'T'HH:mm") !== localValue
  ) {
    throw new InvalidAppointmentTimeError();
  }
  return instant;
}

export function clinicDayRange(
  date: string,
  timeZone = env.CLINIC_TIMEZONE,
): Readonly<{ start: Date; end: Date }> {
  return {
    start: localDateTimeToInstant(date, "00:00", timeZone),
    end: localDateTimeToInstant(nextCalendarDate(date), "00:00", timeZone),
  };
}

export function clinicToday(now = new Date(), timeZone = env.CLINIC_TIMEZONE): string {
  return formatInTimeZone(now, timeZone, "yyyy-MM-dd");
}

export function formatClinicDateTime(instant: Date, pattern = "dd MMM yyyy, HH:mm"): string {
  return formatInTimeZone(instant, env.CLINIC_TIMEZONE, pattern);
}

export function toClinicFormValues(instant: Date): Readonly<{ date: string; time: string }> {
  return {
    date: formatInTimeZone(instant, env.CLINIC_TIMEZONE, "yyyy-MM-dd"),
    time: formatInTimeZone(instant, env.CLINIC_TIMEZONE, "HH:mm"),
  };
}

export function clinicTimezone(): string {
  return env.CLINIC_TIMEZONE;
}
