import { DateTime } from "luxon";
import { z } from "zod";

// Person update schema - only allow safe fields
export const PersonUpdateSchema = z
  .object({
    fullName: z.string().optional(),
    firstName: z.string().optional(),
    email: z.string().email().optional(),
    birthday: z.coerce.date().optional(),
    department: z.string().optional(),
    role: z.string().optional(),
    optedOut: z.boolean().optional(),
  })
  .strict();

// Settings update schema - restrict sensitive fields
export const SettingsUpdateSchema = z
  .object({
    name: z.string().optional(),
    timezone: z
      .string()
      .refine((value) => DateTime.now().setZone(value).isValid, {
        message: "Invalid timezone",
      })
      .optional(),
    emailFromName: z.string().optional(),
    emailFromAddress: z.string().email().optional(),
    birthdaySendHour: z.number().min(0).max(23).optional(),
    birthdaySendMinute: z.number().min(0).max(59).optional(),
  })
  .strict();

// Template update schema
export const TemplateUpdateSchema = z
  .object({
    name: z.string().optional(),
    subject: z.string().optional(),
    content: z.string().optional(),
    imageUrl: z.string().url().optional(),
    isActive: z.boolean().optional(),
    isDefault: z.boolean().optional(),
  })
  .strict();

// Helper to validate and extract safe fields
export function validateUpdate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}
