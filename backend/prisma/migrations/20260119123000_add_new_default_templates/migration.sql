-- Seed additional default templates for all organizations.
-- Uses deterministic-ish text ids to avoid requiring extensions.

INSERT INTO "templates" ("id", "name", "type", "subject", "content", "isDefault", "isActive", "organizationId", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text || o.id || 'modern-gradient-birthday') AS id,
  $tmpl$Modern Gradient Birthday$tmpl$,
  'HTML',
  $tmpl$Happy Birthday {{first_name}}! 🎉$tmpl$,
  $tmpl$<!DOCTYPE html>
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
</html>$tmpl$,
  false,
  false,
  o.id,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "organizations" o
WHERE NOT EXISTS (
  SELECT 1
  FROM "templates" t
  WHERE t."organizationId" = o.id
    AND t."name" = $tmpl$Modern Gradient Birthday$tmpl$
);

INSERT INTO "templates" ("id", "name", "type", "subject", "content", "isDefault", "isActive", "organizationId", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text || o.id || 'minimal-elegant') AS id,
  $tmpl$Minimal & Elegant$tmpl$,
  'HTML',
  $tmpl$Happy Birthday {{first_name}}$tmpl$,
  $tmpl$<!DOCTYPE html>
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
</html>$tmpl$,
  false,
  false,
  o.id,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "organizations" o
WHERE NOT EXISTS (
  SELECT 1
  FROM "templates" t
  WHERE t."organizationId" = o.id
    AND t."name" = $tmpl$Minimal & Elegant$tmpl$
);

INSERT INTO "templates" ("id", "name", "type", "subject", "content", "isDefault", "isActive", "organizationId", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text || o.id || 'fun-colorful-party') AS id,
  $tmpl$Fun & Colorful (Party Theme)$tmpl$,
  'HTML',
  $tmpl$It's Party Time, {{first_name}}! 🎉$tmpl$,
  $tmpl$<!DOCTYPE html>
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
</html>$tmpl$,
  false,
  false,
  o.id,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "organizations" o
WHERE NOT EXISTS (
  SELECT 1
  FROM "templates" t
  WHERE t."organizationId" = o.id
    AND t."name" = $tmpl$Fun & Colorful (Party Theme)$tmpl$
);

INSERT INTO "templates" ("id", "name", "type", "subject", "content", "isDefault", "isActive", "organizationId", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text || o.id || 'corporate-professional') AS id,
  $tmpl$Corporate Professional$tmpl$,
  'HTML',
  $tmpl$Birthday Wishes, {{first_name}}$tmpl$,
  $tmpl$<!DOCTYPE html>
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
</html>$tmpl$,
  false,
  false,
  o.id,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "organizations" o
WHERE NOT EXISTS (
  SELECT 1
  FROM "templates" t
  WHERE t."organizationId" = o.id
    AND t."name" = $tmpl$Corporate Professional$tmpl$
);

INSERT INTO "templates" ("id", "name", "type", "subject", "content", "isDefault", "isActive", "organizationId", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text || o.id || 'warm-personal-community') AS id,
  $tmpl$Warm & Personal (Community Style)$tmpl$,
  'HTML',
  $tmpl$Birthday Blessings, {{first_name}}$tmpl$,
  $tmpl$<!DOCTYPE html>
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
</html>$tmpl$,
  false,
  false,
  o.id,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "organizations" o
WHERE NOT EXISTS (
  SELECT 1
  FROM "templates" t
  WHERE t."organizationId" = o.id
    AND t."name" = $tmpl$Warm & Personal (Community Style)$tmpl$
);
