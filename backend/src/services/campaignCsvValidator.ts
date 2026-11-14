import { parse } from "csv-parse/sync";
import { z } from "zod";
import { normalizeOptionalPhone } from "./phone";

const ContactSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(100),
  last_name: z.string().trim().max(100).optional(),
  email: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
});

export interface ParsedCampaignContact {
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
}

export interface CampaignCsvError {
  row: number;
  field?: string;
  message: string;
}

export interface CampaignCsvResult {
  valid: ParsedCampaignContact[];
  errors: CampaignCsvError[];
  summary: {
    totalRows: number;
    validRows: number; 