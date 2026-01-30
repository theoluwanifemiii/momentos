// CSV Validation & Parsing Logic
// File: backend/src/services/csvValidator.ts

import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { normalizeOptionalPhone } from './phone';
import { SMSService } from './smsService';

// Validation schema
const PersonSchema = z.object({
  full_name: z.string().min(1, 'Full name is required').max(200),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional(),
  birthday: z.string().min(1, 'Birthday is required'),
  first_name: z.string().optional(),
  department: z.string().optional(),
  role: z.string().optional(),
});

export interface CSVValidationResult {
  valid: ParsedPerson[];
  errors: CSVError[];
  summary: {
    totalRows: number;
    validRows: number;
    errorRows: number;
    duplicateEmails: number;
  };
}

export interface ParsedPerson {
  fullName: string;
  firstName?: string;
  email: string;
  phone?: string | null;
  birthday: Date;
  department?: string;
  role?: string;
}

export interface CSVError {
  row: number;
  field?: string;
  message: string;
  data?: any;
}

/**
 * Parses and validates CSV content
 */
export class CSVValidator {
  
  /**
   * Main validation function
   */
  static async validate(csvContent: string): Promise<CSVValidationResult> {
    const errors: CSVError[] = [];
    const valid: ParsedPerson[] = [];
    const seenEmails = new Map<string, number>(); // email -> first row number
    
    let records: any[];
    
    // Step 1: Parse CSV
    try {
      records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true, // Handle UTF-8 BOM
      });
    } catch (err: any) {
      errors.push({
        row: 0,
        message: `CSV parsing failed: ${err.message}`,
      });
      
      return {
        valid: [],
        errors,
        summary: {
          totalRows: 0,
          validRows: 0,
          errorRows: 1,
          duplicateEmails: 0,
        },
      };
    }
    
    if (records.length === 0) {
      errors.push({
        row: 0,
        message: 'CSV file is empty or contains no valid data rows',
      });
    }
    
    // Step 2: Validate each row
    for (let i = 0; i < records.length; i++) {
      const rowNum = i + 2; // +2 because row 1 is header, array is 0-indexed
      const record = this.normalizeKeys(records[i]);
      
      // Validate required fields exist
      const schemaResult = PersonSchema.safeParse(record);
      
      if (!schemaResult.success) {
        const fieldErrors = schemaResult.error.errors.map(e => 
          `${e.path.join('.')}: ${e.message}`
        ).join('; ');
        
        errors.push({
          row: rowNum,
          message: fieldErrors,
          data: record,
        });
        continue;
      }
      
      const data = schemaResult.data;
      
      // Parse birthday
      const birthdayResult = this.parseBirthday(data.birthday);
      
      if (!birthdayResult.success) {
        errors.push({
          row: rowNum,
          field: 'birthday',
          message: birthdayResult.error,
          data: record,
        });
        continue;
      }
      
      // Check for duplicate emails
      const emailLower = data.email.toLowerCase();
      if (seenEmails.has(emailLower)) {
        errors.push({
          row: rowNum,
          field: 'email',
          message: `Duplicate email (first seen at row ${seenEmails.get(emailLower)})`,
          data: record,
        });
        continue;
      }
      
      seenEmails.set(emailLower, rowNum);
      
      let phone: string | null = null;
      if (data.phone) {
        if (!SMSService.isValidNigerianPhone(data.phone)) {
          errors.push({
            row: rowNum,
            field: 'phone',
            message:
              'Invalid phone number format. Use: 08012345678 or +2348012345678',
            data: record,
          });
          continue;
        }
        try {
          phone = normalizeOptionalPhone(data.phone);
        } catch (error: any) {
          errors.push({
            row: rowNum,
            field: 'phone',
            message: error?.message || 'Invalid phone number',
            data: record,
          });
          continue;
        }
      }

      // Extract first name if not provided
      const firstName = data.first_name || this.extractFirstName(data.full_name);
      
      // Valid row
      valid.push({
        fullName: data.full_name,
        firstName,
        email: emailLower,
        phone,
        birthday: birthdayResult.date,
        department: data.department,
        role: data.role,
      });
    }
    
    return {
      valid,
      errors,
      summary: {
        totalRows: records.length,
        validRows: valid.length,
        errorRows: errors.length,
        duplicateEmails: Array.from(seenEmails.values()).length - valid.length,
      },
    };
  }
  
  /**
   * Normalize CSV column names (handle case variations, spaces)
   */
  private static normalizeKeys(record: any): any {
    const normalized: any = {};
    
    const keyMap: { [key: string]: string } = {
      'full_name': 'full_name',
      'fullname': 'full_name',
      'name': 'full_name',
      'full name': 'full_name',
      
      'email': 'email',
      'email address': 'email',
      'e-mail': 'email',

      'phone': 'phone',
      'phone number': 'phone',
      'phonenumber': 'phone',
      'mobile': 'phone',
      'mobile number': 'phone',
      'whatsapp': 'phone',
      'whatsapp number': 'phone',
      
      'birthday': 'birthday',
      'birth_day': 'birthday',
      'date_of_birth': 'birthday',
      'dob': 'birthday',
      'birth date': 'birthday',
      
      'first_name': 'first_name',
      'firstname': 'first_name',
      'first name': 'first_name',
      
      'department': 'department',
      'dept': 'department',
      
      'role': 'role',
      'position': 'role',
      'title': 'role',
    };
    
    for (const [key, value] of Object.entries(record)) {
      const normalizedKey = keyMap[key.toLowerCase().trim()] || key.toLowerCase().trim();
      normalized[normalizedKey] = value;
    }
    
    return normalized;
  }
  
  /**
   * Parse birthday from various formats
   */
  private static parseBirthday(
    dateStr: string
  ): { success: true; date: Date } | { success: false; error: string } {
    
    const formats = [
      // YYYY-MM-DD (preferred)
      { regex: /^(\d{4})-(\d{1,2})-(\d{1,2})$/, order: ['year', 'month', 'day'] },
      
      // DD/MM/YYYY
      { regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, order: ['day', 'month', 'year'] },
      
      // MM/DD/YYYY (flagged but supported)
      { regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, order: ['month', 'day', 'year'] },
      
      // DD-MM-YYYY
      { regex: /^(\d{1,2})-(\d{1,2})-(\d{4})$/, order: ['day', 'month', 'year'] },
    ];
    
    for (const format of formats) {
      const match = dateStr.match(format.regex);
      if (!match) continue;
      
      const parts: any = {};
      format.order.forEach((key, i) => {
        parts[key] = parseInt(match[i + 1], 10);
      });
      
      // Validate ranges
      if (parts.month < 1 || parts.month > 12) continue;
      if (parts.day < 1 || parts.day > 31) continue;
      if (parts.year < 1900 || parts.year > new Date().getFullYear()) continue;
      
      // Handle Feb 29
      if (parts.month === 2 && parts.day === 29) {
        // Allow Feb 29, we'll handle it in delivery logic
      }
      
      // Create date (month is 0-indexed in JS)
      const date = new Date(parts.year, parts.month - 1, parts.day);
      
      // Validate the date is real (handles invalid dates like Feb 31)
      if (
        date.getFullYear() === parts.year &&
        date.getMonth() === parts.month - 1 &&
        date.getDate() === parts.day
      ) {
        return { success: true, date };
      }
    }
    
    return {
      success: false,
      error: `Invalid date format "${dateStr}". Use YYYY-MM-DD (e.g. 1990-05-23) or DD/MM/YYYY`,
    };
  }
  
  /**
   * Extract first name from full name
   */
  private static extractFirstName(fullName: string): string {
    return fullName.split(' ')[0];
  }
  
  /**
   * Generate a sample CSV for download
   */
  static generateSampleCSV(): string {
    const headers = [
      'full_name',
      'email',
      'phone',
      'birthday',
      'first_name',
      'department',
      'role',
    ];
    const samples = [
      [
        'Jane Doe',
        'jane.doe@example.com',
        '+14155552671',
        '1990-05-23',
        'Jane',
        'Engineering',
        'Software Engineer',
      ],
      [
        'John Smith',
        'john.smith@example.com',
        '+447700900123',
        '1985-12-15',
        'John',
        'Marketing',
        'Marketing Manager',
      ],
      [
        'Mary Johnson',
        'mary.j@example.com',
        '+2348012345678',
        '1992-03-08',
        'Mary',
        'Sales',
        'Sales Representative',
      ],
    ];
    
    const rows = [
      headers.join(','),
      ...samples.map(row => row.map(cell => `"${cell}"`).join(',')),
    ];
    
    return rows.join('\n');
  }
}
