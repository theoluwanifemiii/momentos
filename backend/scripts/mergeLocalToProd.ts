import { PrismaClient } from "@prisma/client";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function main() {
  const localUrl = requireEnv("LOCAL_DATABASE_URL");
  const prodUrl = requireEnv("PROD_DATABASE_URL");

  const local = new PrismaClient({ datasources: { db: { url: localUrl } } });
  const prod = new PrismaClient({ datasources: { db: { url: prodUrl } } });

  try {
    const orgs = await local.organization.findMany();
    if (orgs.length > 0) {
      await prod.organization.createMany({ data: orgs, skipDuplicates: true });
    }
    const prodOrgIds = new Set(
      (await prod.organization.findMany({ select: { id: true } })).map(
        (org) => org.id
      )
    );

    const prodTemplates = await prod.template.findMany();
    const templateKey = (template: {
      name: string;
      type: string;
      subject: string;
      content: string;
      imageUrl: string | null;
    }) =>
      [
        template.name,
        template.type,
        template.subject,
        template.content,
        template.imageUrl || "",
      ].join("|");

    const prodTemplateMap = new Map(
      prodTemplates.map((template) => [templateKey(template), template])
    );

    const localTemplates = await local.template.findMany();
    const templateIdMap = new Map<string, string>();

    for (const localTemplate of localTemplates) {
      const key = templateKey(localTemplate);
      const existing = prodTemplateMap.get(key);
      if (existing) {
        templateIdMap.set(localTemplate.id, existing.id);
        continue;
      }
      const created = await prod.template.create({
        data: {
          name: localTemplate.name,
          type: localTemplate.type,
          subject: localTemplate.subject,
          content: localTemplate.content,
          imageUrl: localTemplate.imageUrl,
          isActive: localTemplate.isActive,
          isSystem: localTemplate.isSystem,
          createdAt: localTemplate.createdAt,
          updatedAt: localTemplate.updatedAt,
        },
      });
      prodTemplateMap.set(key, created);
      templateIdMap.set(localTemplate.id, created.id);
    }

    const users = (await local.user.findMany()).filter((user) =>
      prodOrgIds.has(user.organizationId)
    );
    if (users.length > 0) {
      await prod.user.createMany({ data: users, skipDuplicates: true });
    }
    const prodUserIds = new Set(
      (await prod.user.findMany({ select: { id: true } })).map((user) => user.id)
    );

    const onboarding = (await local.onboardingProgress.findMany()).filter(
      (row) => prodOrgIds.has(row.organizationId)
    );
    if (onboarding.length > 0) {
      await prod.onboardingProgress.createMany({
        data: onboarding,
        skipDuplicates: true,
      });
    }

    const people = (await local.person.findMany()).filter((person) =>
      prodOrgIds.has(person.organizationId)
    );
    if (people.length > 0) {
      await prod.person.createMany({ data: people, skipDuplicates: true });
    }
    const prodPersonIds = new Set(
      (await prod.person.findMany({ select: { id: true } })).map(
        (person) => person.id
      )
    );

    const prodTemplateIds = new Set(
      (await prod.template.findMany({ select: { id: true } })).map(
        (template) => template.id
      )
    );

    const deliveryLogs = (await local.deliveryLog.findMany()).filter(
      (log) =>
        prodOrgIds.has(log.organizationId) &&
        prodPersonIds.has(log.personId) &&
        prodTemplateIds.has(templateIdMap.get(log.templateId) || "")
    );
    if (deliveryLogs.length > 0) {
      await prod.deliveryLog.createMany({
        data: deliveryLogs.map((log) => ({
          ...log,
          templateId: templateIdMap.get(log.templateId) || log.templateId,
        })),
        skipDuplicates: true,
      });
    }

    const schedulerRuns = (await local.schedulerRun.findMany()).filter((run) =>
      prodOrgIds.has(run.organizationId)
    );
    if (schedulerRuns.length > 0) {
      await prod.schedulerRun.createMany({
        data: schedulerRuns,
        skipDuplicates: true,
      });
    }

    const waitlist = await local.waitlistEntry.findMany();
    if (waitlist.length > 0) {
      await prod.waitlistEntry.createMany({
        data: waitlist,
        skipDuplicates: true,
      });
    }

    const orgTemplates = (await local.organizationTemplate.findMany()).filter(
      (row) => prodOrgIds.has(row.organizationId)
    );
    if (orgTemplates.length > 0) {
      await prod.organizationTemplate.createMany({
        data: orgTemplates.map((row) => ({
          ...row,
          templateId: templateIdMap.get(row.templateId) || row.templateId,
        })),
        skipDuplicates: true,
      });
    }

    const adminUsers = await local.adminUser.findMany();
    if (adminUsers.length > 0) {
      await prod.adminUser.createMany({
        data: adminUsers,
        skipDuplicates: true,
      });
    }
    const prodAdminIds = new Set(
      (await prod.adminUser.findMany({ select: { id: true } })).map(
        (admin) => admin.id
      )
    );

    const adminInvites = (await local.adminInvite.findMany()).filter(
      (invite) => prodAdminIds.has(invite.createdBy)
    );
    if (adminInvites.length > 0) {
      await prod.adminInvite.createMany({
        data: adminInvites,
        skipDuplicates: true,
      });
    }

    const adminSessions = (await local.adminSession.findMany()).filter(
      (session) => prodAdminIds.has(session.adminId)
    );
    if (adminSessions.length > 0) {
      await prod.adminSession.createMany({
        data: adminSessions,
        skipDuplicates: true,
      });
    }

    const adminAuditLogs = (await local.adminAuditLog.findMany()).filter(
      (log) => prodAdminIds.has(log.adminId)
    );
    if (adminAuditLogs.length > 0) {
      await prod.adminAuditLog.createMany({
        data: adminAuditLogs,
        skipDuplicates: true,
      });
    }

    const otps = (await local.otp.findMany()).filter(
      (otp) => !otp.userId || prodUserIds.has(otp.userId)
    );
    if (otps.length > 0) {
      await prod.otp.createMany({ data: otps, skipDuplicates: true });
    }

    console.log("Merge complete.");
  } finally {
    await local.$disconnect();
    await prod.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
