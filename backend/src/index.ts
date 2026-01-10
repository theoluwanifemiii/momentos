// Main API Server
// File: backend/src/index.ts

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { CSVValidator } from './services/csvValidator';

const app = express();
const prisma = new PrismaClient();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

// JWT Secret (use env var in production)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Auth middleware
interface AuthRequest extends Request {
  userId?: string;
  organizationId?: string;
}

async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; organizationId: string };
    req.userId = decoded.userId;
    req.organizationId = decoded.organizationId;
    
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ============================================================================
// AUTH ROUTES
// ============================================================================

// Register new organization + admin user
app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      organizationName: z.string().min(1),
      timezone: z.string().default('UTC'),
    });
    
    const data = schema.parse(req.body);
    
    // Check if user exists
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });
    
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(data.password, 10);
    
    // Create organization and user
    const org = await prisma.organization.create({
      data: {
        name: data.organizationName,
        timezone: data.timezone,
        users: {
          create: {
            email: data.email,
            passwordHash,
            role: 'ADMIN',
          },
        },
      },
      include: {
        users: true,
      },
    });
    
    const user = org.users[0];
    
    // Generate token
    const token = jwt.sign(
      { userId: user.id, organizationId: org.id },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      organization: {
        id: org.id,
        name: org.name,
        timezone: org.timezone,
      },
    });
  } catch (err: any) {
    console.error('Register error:', err);
    res.status(400).json({ error: err.message || 'Registration failed' });
  }
});

// Login
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      password: z.string(),
    });
    
    const data = schema.parse(req.body);
    
    // Find user
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: { organization: true },
    });
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Check password
    const valid = await bcrypt.compare(data.password, user.passwordHash);
    
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate token
    const token = jwt.sign(
      { userId: user.id, organizationId: user.organizationId },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        timezone: user.organization.timezone,
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Login failed' });
  }
});

// ============================================================================
// PEOPLE ROUTES
// ============================================================================

// Upload CSV
app.post('/api/people/upload', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { csvContent } = req.body;
    
    if (!csvContent) {
      return res.status(400).json({ error: 'CSV content is required' });
    }
    
    // Validate CSV
    const validation = await CSVValidator.validate(csvContent);
    
    // If there are valid rows, upsert them
    if (validation.valid.length > 0) {
      const orgId = req.organizationId!;
      
      // Upsert each person (update if email exists, create if not)
      for (const person of validation.valid) {
        await prisma.person.upsert({
          where: {
            organizationId_email: {
              organizationId: orgId,
              email: person.email,
            },
          },
          update: {
            fullName: person.fullName,
            firstName: person.firstName,
            birthday: person.birthday,
            department: person.department,
            role: person.role,
          },
          create: {
            organizationId: orgId,
            fullName: person.fullName,
            firstName: person.firstName,
            email: person.email,
            birthday: person.birthday,
            department: person.department,
            role: person.role,
          },
        });
      }
    }
    
    res.json({
      success: true,
      summary: validation.summary,
      errors: validation.errors,
    });
  } catch (err: any) {
    console.error('CSV upload error:', err);
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

// List people
app.get('/api/people', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const people = await prisma.person.findMany({
      where: {
        organizationId: req.organizationId!,
      },
      orderBy: {
        fullName: 'asc',
      },
    });
    
    res.json({ people });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get upcoming birthdays (next 30 days)
app.get('/api/people/upcoming', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const people = await prisma.person.findMany({
      where: {
        organizationId: req.organizationId!,
        optedOut: false,
      },
    });
    
    const today = new Date();
    const in30Days = new Date();
    in30Days.setDate(today.getDate() + 30);
    
    // Filter by upcoming birthdays (check month/day only)
    const upcoming = people.filter(person => {
      const bday = new Date(person.birthday);
      const thisYearBirthday = new Date(
        today.getFullYear(),
        bday.getMonth(),
        bday.getDate()
      );
      
      return thisYearBirthday >= today && thisYearBirthday <= in30Days;
    }).sort((a, b) => {
      const aBday = new Date(a.birthday);
      const bBday = new Date(b.birthday);
      const aThisYear = new Date(today.getFullYear(), aBday.getMonth(), aBday.getDate());
      const bThisYear = new Date(today.getFullYear(), bBday.getMonth(), bBday.getDate());
      return aThisYear.getTime() - bThisYear.getTime();
    });
    
    res.json({ upcoming });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Download sample CSV
app.get('/api/people/sample-csv', (req: Request, res: Response) => {
  const csv = CSVValidator.generateSampleCSV();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=sample-people.csv');
  res.send(csv);
});

// Update person
app.put('/api/people/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const person = await prisma.person.update({
      where: {
        id,
        organizationId: req.organizationId!,
      },
      data: req.body,
    });
    
    res.json({ person });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete person
app.delete('/api/people/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    await prisma.person.delete({
      where: {
        id,
        organizationId: req.organizationId!,
      },
    });
    
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// SETTINGS ROUTES
// ============================================================================

app.get('/api/settings', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.organizationId! },
    });
    
    res.json({ organization: org });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/settings', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const org = await prisma.organization.update({
      where: { id: req.organizationId! },
      data: req.body,
    });
    
    res.json({ organization: org });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
// Add these routes to backend/src/index.ts
// Place them BEFORE the "START SERVER" section

// ============================================================================
// TEMPLATE ROUTES
// ============================================================================

// List templates
app.get('/api/templates', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const templates = await prisma.template.findMany({
      where: {
        organizationId: req.organizationId!,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    
    res.json({ templates });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get single template
app.get('/api/templates/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const template = await prisma.template.findFirst({
      where: {
        id,
        organizationId: req.organizationId!,
      },
    });
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    res.json({ template });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create template
app.post('/api/templates', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const schema = z.object({
      name: z.string().min(1),
      type: z.enum(['PLAIN_TEXT', 'HTML', 'CUSTOM_IMAGE']),
      subject: z.string().min(1),
      content: z.string().min(1),
      imageUrl: z.string().optional(),
    });
    
    const data = schema.parse(req.body);
    
    const template = await prisma.template.create({
      data: {
        ...data,
        organizationId: req.organizationId!,
        isDefault: false,
        isActive: true,
      },
    });
    
    res.json({ template });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Update template
app.put('/api/templates/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const template = await prisma.template.update({
      where: {
        id,
        organizationId: req.organizationId!,
      },
      data: req.body,
    });
    
    res.json({ template });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete template
app.delete('/api/templates/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    await prisma.template.delete({
      where: {
        id,
        organizationId: req.organizationId!,
      },
    });
    
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Preview template with sample data
app.post('/api/templates/:id/preview', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const template = await prisma.template.findFirst({
      where: {
        id,
        organizationId: req.organizationId!,
      },
    });
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const org = await prisma.organization.findUnique({
      where: { id: req.organizationId! },
    });
    
    // Sample data for preview
    const sampleData = {
      first_name: 'John',
      full_name: 'John Doe',
      organization_name: org?.name || 'Your Organization',
      date: new Date().toLocaleDateString(),
    };
    
    // Interpolate variables
    let previewSubject = template.subject;
    let previewContent = template.content;
    
    Object.entries(sampleData).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      previewSubject = previewSubject.replace(regex, value);
      previewContent = previewContent.replace(regex, value);
    });
    
    res.json({
      subject: previewSubject,
      content: previewContent,
      type: template.type,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Test send template (sends to current user's email)
app.post('/api/templates/:id/test', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const template = await prisma.template.findFirst({
      where: {
        id,
        organizationId: req.organizationId!,
      },
    });
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
    });
    
    const org = await prisma.organization.findUnique({
      where: { id: req.organizationId! },
    });
    
    // For now, just return success
    // We'll implement actual email sending next
    res.json({
      success: true,
      message: `Test email would be sent to ${user?.email}`,
      preview: {
        to: user?.email,
        subject: template.subject,
        content: template.content.substring(0, 100) + '...',
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create default templates on first login (helper endpoint)
app.post('/api/templates/create-defaults', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.template.findFirst({
      where: { organizationId: req.organizationId! },
    });
    
    if (existing) {
      return res.json({ message: 'Default templates already exist' });
    }
    
    const org = await prisma.organization.findUnique({
      where: { id: req.organizationId! },
    });
    
    const defaultTemplates = [
      {
        name: 'Simple Birthday',
        type: 'PLAIN_TEXT' as const,
        subject: 'Happy Birthday {{first_name}}! 🎉',
        content: `Happy Birthday {{first_name}}!

Wishing you a wonderful day filled with joy and happiness.

From everyone at {{organization_name}}`,
        isDefault: true,
        isActive: true,
      },
      {
        name: 'Professional Birthday',
        type: 'HTML' as const,
        subject: 'Happy Birthday {{first_name}}!',
        content: `<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 32px;">🎉 Happy Birthday! 🎉</h1>
  </div>
  
  <div style="background: white; padding: 40px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="font-size: 18px; line-height: 1.6; color: #374151;">
      Dear {{first_name}},
    </p>
    
    <p style="font-size: 16px; line-height: 1.6; color: #374151;">
      On behalf of everyone at {{organization_name}}, we want to wish you a very happy birthday!
      We hope your special day is filled with joy, laughter, and wonderful memories.
    </p>
    
    <p style="font-size: 16px; line-height: 1.6; color: #374151;">
      Thank you for being such an important part of our community.
    </p>
    
    <div style="margin-top: 30px; padding-top: 30px; border-top: 1px solid #e5e7eb;">
      <p style="font-size: 14px; color: #6b7280; margin: 0;">
        With warm wishes,<br>
        <strong>{{organization_name}}</strong>
      </p>
    </div>
  </div>
  
  <div style="text-align: center; margin-top: 20px;">
    <p style="font-size: 12px; color: #9ca3af;">
      This is an automated birthday message from MomentOS
    </p>
  </div>
</body>
</html>`,
        isDefault: true,
        isActive: false,
      },
      {
        name: 'Fun & Colorful',
        type: 'HTML' as const,
        subject: '🎂 It\'s Your Special Day, {{first_name}}! 🎈',
        content: `<html>
<body style="font-family: 'Comic Sans MS', cursive, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #fef3c7;">
  <div style="background: white; padding: 30px; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.1);">
    <div style="text-align: center; margin-bottom: 30px;">
      <div style="font-size: 64px; margin-bottom: 10px;">🎉🎂🎈</div>
      <h1 style="color: #dc2626; margin: 0; font-size: 36px; text-shadow: 2px 2px 4px rgba(0,0,0,0.1);">
        HAPPY BIRTHDAY!
      </h1>
    </div>
    
    <p style="font-size: 20px; text-align: center; color: #1f2937; line-height: 1.8;">
      Hey <strong>{{first_name}}</strong>! 🎊
    </p>
    
    <p style="font-size: 16px; text-align: center; color: #374151; line-height: 1.6;">
      Another trip around the sun completed! We hope your birthday is as amazing as you are.
      May your day be filled with cake, laughter, and everything that makes you smile!
    </p>
    
    <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 30px 0; text-align: center;">
      <p style="margin: 0; font-size: 18px; color: #92400e;">
        🎁 Make a wish! 🎁
      </p>
    </div>
    
    <p style="text-align: center; font-size: 14px; color: #6b7280; margin-top: 30px;">
      Cheers from all of us at<br>
      <strong style="color: #1f2937; font-size: 16px;">{{organization_name}}</strong>
    </p>
  </div>
</body>
</html>`,
        isDefault: true,
        isActive: false,
      },
    ];
    
    const created = await Promise.all(
      defaultTemplates.map(template =>
        prisma.template.create({
          data: {
            ...template,
            organizationId: req.organizationId!,
          },
        })
      )
    );
    
    res.json({
      success: true,
      message: 'Default templates created',
      count: created.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// START SERVER
// ============================================================================

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 MomentOS API running on http://localhost:${PORT}`);
});