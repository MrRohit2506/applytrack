import { z } from "zod";
import { env } from "../config/env.js";
import { GROUP_BY } from "../services/analytics.js";
import { parseCalendarDate, todayCalendarDate } from "../utils/dates.js";
import { calendarDate, unset, wholeNumber } from "./application.schemas.js";

const windowDays = () =>
  unset(wholeNumber("windowDays").min(1, "windowDays must be at least 1").max(90, "windowDays must be at most 90"));

export const overviewQuerySchema = z
  .object({
    from: unset(calendarDate("From date")),
    to: unset(calendarDate("To date")),
    groupBy: unset(z.enum(GROUP_BY, { errorMap: () => ({ message: `groupBy must be one of: ${GROUP_BY.join(", ")}` }) })),
    windowDays: windowDays(),
    today: unset(calendarDate("Today")),
  })
  .strict()
  .superRefine((q, ctx) => {
    if (q.from && q.to && q.from.getTime() > q.to.getTime()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "To date must not be before the from date" });
    }
  })
  .transform((q) => ({
    from: q.from,
    to: q.to,
    groupBy: q.groupBy ?? "month",
    windowDays: q.windowDays ?? env.REMINDER_WINDOW_DAYS,
    today: q.today ?? parseCalendarDate(todayCalendarDate()),
  }));

export const remindersQuerySchema = z
  .object({ windowDays: windowDays(), today: unset(calendarDate("Today")) })
  .strict()
  .transform((q) => ({
    windowDays: q.windowDays ?? env.REMINDER_WINDOW_DAYS,
    today: q.today ?? parseCalendarDate(todayCalendarDate()),
  }));

// Import is a PREVIEW unless commit=true is passed explicitly.
export const importQuerySchema = z
  .object({
    commit: unset(z.enum(["true", "false"], { errorMap: () => ({ message: "commit must be true or false" }) })),
    duplicates: unset(z.enum(["skip", "import"], { errorMap: () => ({ message: "duplicates must be skip or import" }) })),
  })
  .strict()
  .transform((q) => ({ commit: q.commit === "true", duplicates: q.duplicates ?? "skip" }));
