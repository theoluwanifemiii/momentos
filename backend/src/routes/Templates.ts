import { Express, Response } from "express";
import { TemplateType } from "@prisma/client";
import { EmailService } from "../services/emailService";
import { computeOnboardingState, markOnboardingStep } from "../services/onboarding";
import { OrganizationTemplateUpdateSchema, TemplateUpdateSchema, validateUpdate } from "../middleware/validation";
import { authenticate, AuthRequest, DEFAULT_FROM_EMAIL, DEFAULT_FROM_NAME, getUserErrorMessage, interpolateTemplate, prisma } from "../serverContext";

export function registerTemplatesRoutes(app: Express) {
// TEMPLATE ROUTES
// ============================================================================

// List templates
app.get(
  "/api/templates",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const assignments = await prisma.organizationTemplate.findMany({
        where: {
          organizationId: req.organizationId!,
          isActive: true,
        },
        include: { template: true },
        orderBy: { assignedAt: "desc" },
      });

      res.json({
        templates: assignments.map((assignment) => ({
          ...assignment.template,
          isDefault: assignment.isDefault,
          isActive: assignment.isActive,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: getUserErrorMessage(err) });
    }
  }
);

// Get single template
app.get(
  "/api/templates/:id",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const assignment = await prisma.organizationTemplate.findFirst({
        where: {
          organizationId: req.organizationId!,
          templateId: id,
          isActive: true,
        },
        include: { template: true },
      });

      if (!assignment) {
        return res.status(404).json({ error: "Template not found" });
      }

      res.json({
        template: {
          ...assignment.template,
          isDefault: assignment.isDefault,
          isActive: assignment.isActive,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: getUserErrorMessage(err) });
    }
  }
);

// Create template (first template becomes default).
app.post(
  "/api/templates",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      return res.status(403).json({
        error: "Custom templates are disabled. Use the default templates.",
      });
    } catch (err: any) {
      res.status(400).json({ error: getUserErrorMessage(err) });
    }
  }
);

// Update template; default selection forces active and clears other defaults.
app.put(
  "/api/templates/:id",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const safeData = validateUpdate(
        OrganizationTemplateUpdateSchema,
        req.body
      );

      const assignment = await prisma.organizationTemplate.findFirst({
        where: {
          organizationId: req.organizationId!,
          templateId: id,
        },
        include: { template: true },
      });

      if (!assignment) {
        return res.status(404).json({ error: "Template not found" });
      }

      let updatedAssignment;
      if (safeData?.isDefault === true) {
        const [updated] = await prisma.$transaction([
          prisma.organizationTemplate.update({
            where: { id: assignment.id },
            data: { isDefault: true, isActive: true },
          }),
          prisma.organizationTemplate.updateMany({
            where: {
              organizationId: req.organizationId!,
              id: { not: assignment.id },
              isDefault: true,
            },
            data: { isDefault: false },
          }),
        ]);
        updatedAssignment = updated;
      } else {
        updatedAssignment = await prisma.organizationTemplate.update({
          where: { id: assignment.id },
          data: {
            ...(safeData.isDefault !== undefined
              ? { isDefault: safeData.isDefault }
              : {}),
            ...(safeData.isActive !== undefined
              ? { isActive: safeData.isActive }
              : {}),
          },
        });
      }

      const onboarding = await computeOnboardingState(
        prisma,
        req.organizationId!
      );

      res.json({
        template: {
          ...assignment.template,
          isDefault: updatedAssignment.isDefault,
          isActive: updatedAssignment.isActive,
        },
        onboarding,
      });
    } catch (err: any) {
      res.status(500).json({ error: getUserErrorMessage(err) });
    }
  }
);

// Delete template; keep at least one default template per org.
app.delete(
  "/api/templates/:id",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      return res.status(403).json({
        error: "Default templates cannot be deleted.",
      });
    } catch (err: any) {
      res.status(500).json({ error: getUserErrorMessage(err) });
    }
  }
);

// Preview template with sample data
app.post(
  "/api/templates/:id/preview",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const assignment = await prisma.organizationTemplate.findFirst({
        where: {
          organizationId: req.organizationId!,
          templateId: id,
          isActive: true,
        },
        include: { template: true },
      });

      if (!assignment) {
        return res.status(404).json({ error: "Template not found" });
      }
      const template = assignment.template;

      const org = await prisma.organization.findUnique({
        where: { id: req.organizationId! },
      });

      // Sample data for preview
      const sampleData = {
        first_name: "John",
        full_name: "John Doe",
        organization_name: org?.name || "Your Organization",
        date: new Date().toLocaleDateString(),
      };

      // Interpolate variables
      let previewSubject = template.subject;
      let previewContent = template.content;

      Object.entries(sampleData).forEach(([key, value]) => {
        const regex = new RegExp(`{{${key}}}`, "g");
        previewSubject = previewSubject.replace(regex, value);
        previewContent = previewContent.replace(regex, value);
      });

      res.json({
        subject: previewSubject,
        content: previewContent,
        type: template.type,
      });
    } catch (err: any) {
      res.status(500).json({ error: getUserErrorMessage(err) });
    }
  }
);

// Test send template (sends to current user's email)
app.post(
  "/api/templates/:id/test",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const assignment = await prisma.organizationTemplate.findFirst({
        where: {
          organizationId: req.organizationId!,
          templateId: id,
          isActive: true,
        },
        include: { template: true },
      });

      if (!assignment) {
        return res.status(404).json({ error: "Template not found" });
      }
      const template = assignment.template;

      const user = await prisma.user.findUnique({
        where: { id: req.userId! },
      });

      const org = await prisma.organization.findUnique({
        where: { id: req.organizationId! },
      });

      // Sample data for test email
      const sampleData = {
        first_name: user?.email.split("@")[0] || "You",
        full_name: user?.email.split("@")[0] || "You",
        organization_name: org?.name || "Your Organization",
        date: new Date().toLocaleDateString(),
      };

      // Interpolate variables
      let emailSubject = template.subject;
      let emailContent = template.content;

      Object.entries(sampleData).forEach(([key, value]) => {
        const regex = new RegExp(`{{${key}}}`, "g");
        emailSubject = emailSubject.replace(regex, value);
        emailContent = emailContent.replace(regex, value);
      });

      // Send actual email via Resend
      const fromEmail = org?.emailFromAddress || DEFAULT_FROM_EMAIL;

      if (!fromEmail) {
        return res.status(400).json({ error: "Sender email not configured" });
      }

      const result = await EmailService.send({
        to: user!.email,
        subject: emailSubject,
        html: template.type === "HTML" ? emailContent : undefined,
        text: template.type === "PLAIN_TEXT" ? emailContent : undefined,
        from: {
          name: org?.name || DEFAULT_FROM_NAME || "",
          email: fromEmail,
        },
      });

      const onboarding = await markOnboardingStep(
        prisma,
        req.organizationId!,
        "send_test_email"
      );

      res.json({
        success: true,
        message: `Test email sent to ${user?.email}`,
        emailId: result.id,
        onboarding,
      });
    } catch (err: any) {
      console.error("Test send error:", err);
      res.status(500).json({ error: getUserErrorMessage(err) });
    }
  }
);

// Create default templates on first login (helper endpoint)
app.post(
  "/api/templates/create-defaults",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const defaultTemplates = [
        {
          name: "Simple Birthday",
          type: "PLAIN_TEXT" as const,
          subject: "Happy Birthday {{first_name}}! 🎉",
          content: `Happy Birthday {{first_name}}!

Wishing you a wonderful day filled with joy and happiness.

From everyone at {{organization_name}}`,
          isSystem: true,
        },
        {
          name: "Professional Birthday",
          type: "HTML" as const,
          subject: "Happy Birthday {{first_name}}!",
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
          isSystem: true,
        },
        {
          name: "Fun & Colorful",
          type: "HTML" as const,
          subject: "🎂 It's Your Special Day, {{first_name}}! 🎈",
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
          isSystem: true,
        },
        {
          name: "Modern Gradient Birthday",
          type: "HTML" as const,
          subject: "Happy Birthday {{first_name}}! 🎉",
          content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Happy Birthday!</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 50px 30px; text-align: center;">
              <div style="font-size: 48px; margin-bottom: 10px;">🎉</div>
              <h1 style="margin: 0; color: #ffffff; font-size: 36px; font-weight: 700; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                Happy Birthday!
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px 0; font-size: 20px; color: #1f2937; font-weight: 600;">
                Dear {{first_name}},
              </p>
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">
                On behalf of everyone at <strong>{{organization_name}}</strong>, we want to wish you the happiest of birthdays! 🎂
              </p>
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">
                May your special day be filled with joy, laughter, and wonderful memories. We're grateful to have you as part of our community!
              </p>
              <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 12px; padding: 24px; margin: 30px 0; text-align: center;">
                <p style="margin: 0; font-size: 18px; color: #92400e; font-weight: 600;">
                  🎁 Make a wish! 🎁
                </p>
              </div>
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #4b5563;">
                Thank you for being such an important part of our family. Here's to another amazing year ahead!
              </p>
              <div style="margin-top: 30px; padding-top: 30px; border-top: 1px solid #e5e7eb;">
                <p style="margin: 0; font-size: 16px; color: #6b7280;">
                  With warm wishes,<br>
                  <strong style="color: #1f2937;">{{organization_name}}</strong>
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 10px 0; font-size: 12px; color: #9ca3af;">
                This is an automated birthday message from MomentOS
              </p>
              <p style="margin: 0; font-size: 12px;">
                <a href="{{unsubscribe_link}}" style="color: #6b7280; text-decoration: none;">Unsubscribe from birthday emails</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
          </html>`,
          isSystem: true,
        },
        {
          name: "Minimal & Elegant",
          type: "HTML" as const,
          subject: "Happy Birthday {{first_name}}",
          content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Happy Birthday</title>
</head>
<body style="margin: 0; padding: 0; font-family: Georgia, 'Times New Roman', serif; background-color: #ffffff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding: 60px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px;">
          <tr>
            <td style="text-align: center; padding-bottom: 40px; border-bottom: 2px solid #000000;">
              <h1 style="margin: 0; font-size: 42px; font-weight: 400; letter-spacing: 2px; color: #000000;">
                HAPPY BIRTHDAY
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 50px 0;">
              <p style="margin: 0 0 30px 0; font-size: 18px; line-height: 1.8; color: #333333; text-align: center;">
                Dear <strong>{{first_name}}</strong>,
              </p>
              <p style="margin: 0 0 30px 0; font-size: 16px; line-height: 1.8; color: #555555; text-align: center;">
                Wishing you a day filled with happiness and a year filled with joy.
              </p>
              <div style="text-align: center; margin: 40px 0;">
                <div style="display: inline-block; border: 2px solid #000000; border-radius: 50%; width: 100px; height: 100px; line-height: 100px; font-size: 48px;">
                  🎂
                </div>
              </div>
              <p style="margin: 0 0 30px 0; font-size: 16px; line-height: 1.8; color: #555555; text-align: center;">
                From all of us at <strong>{{organization_name}}</strong>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding-top: 40px; border-top: 1px solid #cccccc; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #999999;">
                <a href="{{unsubscribe_link}}" style="color: #999999; text-decoration: none;">Unsubscribe</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
          </html>`,
          isSystem: true,
        },
        {
          name: "Fun & Colorful (Party Theme)",
          type: "HTML" as const,
          subject: "It's Party Time, {{first_name}}! 🎉",
          content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>It's Party Time!</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Comic Sans MS', cursive, sans-serif; background: linear-gradient(180deg, #fef3c7 0%, #fde68a 100%);">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.15);">
          <tr>
            <td style="background: linear-gradient(135deg, #ff6b6b 0%, #feca57 25%, #48dbfb 50%, #ff9ff3 75%, #ff6b6b 100%); padding: 10px; text-align: center;">
              <div style="font-size: 64px; margin: 20px 0;">🎉🎂🎈🎁🎊</div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #ffffff; padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0 0 20px 0; font-size: 48px; color: #ff6b6b; text-shadow: 3px 3px 0px #feca57, 6px 6px 0px #48dbfb;">
                HAPPY BIRTHDAY!
              </h1>
              <p style="margin: 0 0 30px 0; font-size: 24px; color: #2d3436; font-weight: bold;">
                Hey {{first_name}}! 🎊
              </p>
              <p style="margin: 0 0 25px 0; font-size: 18px; line-height: 1.6; color: #636e72;">
                Another trip around the sun completed! 🌞
              </p>
              <p style="margin: 0 0 30px 0; font-size: 16px; line-height: 1.6; color: #636e72;">
                We hope your birthday is as <strong style="color: #ff6b6b;">AMAZING</strong> as you are! May your day be filled with cake, laughter, and everything that makes you smile! 😄
              </p>
              <div style="background: linear-gradient(135deg, #ffeaa7 0%, #fdcb6e 100%); border-radius: 15px; padding: 25px; margin: 30px 0; border: 4px dashed #ff6b6b;">
                <p style="margin: 0; font-size: 20px; color: #2d3436; font-weight: bold;">
                  🎁 Make a wish! 🎁
                </p>
                <p style="margin: 10px 0 0 0; font-size: 14px; color: #636e72;">
                  (But don't tell anyone or it won't come true!)
                </p>
              </div>
              <div style="margin: 30px 0;">
                <p style="margin: 0; font-size: 16px; color: #636e72;">
                  Party on! 🥳
                </p>
                <p style="margin: 10px 0 0 0; font-size: 18px; color: #2d3436; font-weight: bold;">
                  {{organization_name}}
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 3px solid #ff6b6b;">
              <p style="margin: 0 0 10px 0; font-size: 12px; color: #95a5a6;">
                This birthday message was sent with 💖 by MomentOS
              </p>
              <p style="margin: 0; font-size: 12px;">
                <a href="{{unsubscribe_link}}" style="color: #95a5a6; text-decoration: none;">Unsubscribe</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
          </html>`,
          isSystem: true,
        },
        {
          name: "Corporate Professional",
          type: "HTML" as const,
          subject: "Birthday Wishes, {{first_name}}",
          content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Birthday Wishes</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border: 1px solid #e0e0e0;">
          <tr>
            <td style="background-color: #1a73e8; padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600; letter-spacing: 0.5px;">
                Happy Birthday, {{first_name}}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 50px 40px;">
              <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 1.6; color: #333333;">
                Dear {{first_name}},
              </p>
              <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 1.6; color: #555555;">
                On behalf of the entire team at {{organization_name}}, I would like to extend our warmest birthday wishes to you.
              </p>
              <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 1.6; color: #555555;">
                Your contributions to our organization are greatly valued, and we hope this special day brings you joy and happiness.
              </p>
              <div style="background-color: #f8f9fa; border-left: 4px solid #1a73e8; padding: 20px; margin: 30px 0;">
                <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #333333; font-style: italic;">
                  "May your birthday mark the beginning of another wonderful year filled with success and prosperity."
                </p>
              </div>
              <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 1.6; color: #555555;">
                Wishing you all the best on your special day and throughout the coming year.
              </p>
              <div style="margin-top: 40px;">
                <p style="margin: 0 0 5px 0; font-size: 16px; color: #333333;">
                  Warm regards,
                </p>
                <p style="margin: 0; font-size: 16px; font-weight: 600; color: #1a73e8;">
                  {{organization_name}}
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f9fa; padding: 30px; border-top: 1px solid #e0e0e0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="text-align: center; padding-bottom: 15px;">
                    <p style="margin: 0; font-size: 14px; color: #666666; line-height: 1.5;">
                      {{organization_name}}<br>
                      Automated Birthday Notification System
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="text-align: center;">
                    <p style="margin: 0; font-size: 12px; color: #999999;">
                      <a href="{{unsubscribe_link}}" style="color: #999999; text-decoration: none;">Unsubscribe from birthday notifications</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
          </html>`,
          isSystem: true,
        },
        {
          name: "Warm & Personal (Community Style)",
          type: "HTML" as const,
          subject: "Birthday Blessings, {{first_name}}",
          content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Birthday Blessings</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Georgia', serif; background-color: #fef6e4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fef6e4; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 50px 30px; text-align: center;">
              <div style="font-size: 50px; margin-bottom: 15px;">🎂</div>
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 400; font-family: 'Georgia', serif;">
                Celebrating You Today
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 45px 35px;">
              <p style="margin: 0 0 25px 0; font-size: 18px; color: #2c3e50; font-weight: 600;">
                Dear {{first_name}},
              </p>
              <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 1.8; color: #34495e;">
                On this special day, we want to take a moment to celebrate you and the blessing you are to our {{organization_name}} family.
              </p>
              <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 1.8; color: #34495e;">
                Your presence in our community brings joy, and we are grateful for the unique gifts and talents you share with us.
              </p>
              <div style="background: linear-gradient(135deg, #fff5f5 0%, #ffe5e5 100%); border-radius: 10px; padding: 30px; margin: 35px 0; text-align: center; border: 2px solid #f5576c;">
                <p style="margin: 0 0 15px 0; font-size: 20px; color: #c0392b; font-weight: 600;">
                  🙏 A Birthday Blessing 🙏
                </p>
                <p style="margin: 0; font-size: 16px; line-height: 1.7; color: #7f8c8d; font-style: italic;">
                  May this year bring you abundant joy, peace, and countless reasons to smile. May you continue to grow in love and wisdom.
                </p>
              </div>
              <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 1.8; color: #34495e;">
                We pray that your birthday is filled with wonderful moments and that the year ahead brings you closer to your dreams.
              </p>
              <div style="margin-top: 35px; padding-top: 30px; border-top: 1px solid #ecf0f1;">
                <p style="margin: 0 0 10px 0; font-size: 16px; color: #7f8c8d;">
                  With love and warm wishes,
                </p>
                <p style="margin: 0; font-size: 18px; font-weight: 600; color: #2c3e50;">
                  Your {{organization_name}} Family
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f9fa; padding: 25px; text-align: center; border-top: 1px solid #ecf0f1;">
              <p style="margin: 0 0 10px 0; font-size: 13px; color: #95a5a6;">
                This birthday message was sent with care by {{organization_name}}
              </p>
              <p style="margin: 0; font-size: 12px;">
                <a href="{{unsubscribe_link}}" style="color: #95a5a6; text-decoration: none;">Unsubscribe from birthday messages</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
          </html>`,
          isSystem: true,
        },
      ];

      const existingGlobals = await prisma.template.findMany({
        where: { name: { in: defaultTemplates.map((template) => template.name) } },
      });
      const existingByName = new Map(
        existingGlobals.map((template) => [template.name, template])
      );

      const createdGlobals = await Promise.all(
        defaultTemplates
          .filter((template) => !existingByName.has(template.name))
          .map((template) =>
            prisma.template.create({
              data: {
                ...template,
                isActive: true,
                isSystem: true,
              },
            })
          )
      );

      const globalTemplates = [
        ...existingGlobals,
        ...createdGlobals,
      ];

      const assignments = await prisma.organizationTemplate.findMany({
        where: { organizationId: req.organizationId! },
        select: { templateId: true, isDefault: true },
      });
      const assignedIds = new Set(assignments.map((row) => row.templateId));

      const assignmentData = globalTemplates
        .filter((template) => !assignedIds.has(template.id))
        .map((template) => ({
          organizationId: req.organizationId!,
          templateId: template.id,
          isDefault: template.name === "Simple Birthday",
          isActive: true,
        }));

      if (assignmentData.length > 0) {
        await prisma.organizationTemplate.createMany({
          data: assignmentData,
          skipDuplicates: true,
        });
      }

      const hasDefault = assignments.some((row) => row.isDefault);
      if (!hasDefault) {
        const fallback = globalTemplates.find(
          (template) => template.name === "Simple Birthday"
        );
        if (fallback) {
          await prisma.organizationTemplate.updateMany({
            where: {
              organizationId: req.organizationId!,
              templateId: fallback.id,
            },
            data: { isDefault: true, isActive: true },
          });
        }
      }

      const onboarding = await computeOnboardingState(
        prisma,
        req.organizationId!
      );

      res.json({
        success: true,
        message: "Default templates assigned",
        count: assignmentData.length,
        onboarding,
      });
    } catch (err: any) {
      res.status(500).json({ error: getUserErrorMessage(err) });
    }
  }
);

// ============================================================================
}
