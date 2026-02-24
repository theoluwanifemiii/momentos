import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
process.env.NODE_ENV = process.env.NODE_ENV || "test";

let appInstance: any;
let prismaAny: any;
let jwtSecret = process.env.JWT_SECRET as string;

const ensureRuntime = async () => {
  if (appInstance && prismaAny) return;
  const appModule = await import("../src/app");
  const serverContextModule = await import("../src/serverContext");
  appInstance = appModule.default;
  prismaAny = serverContextModule.prisma as any;
  jwtSecret = serverContextModule.JWT_SECRET;
};

const closeServer = (server: Server) =>
  new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

const startServer = () =>
  new Promise<Server>((resolve) => {
    const server = appInstance.listen(0, () => resolve(server));
  });

const requestJson = async (params: {
  baseUrl: string;
  method?: string;
  path: string;
  token?: string;
  body?: unknown;
}) => {
  const response = await fetch(`${params.baseUrl}${params.path}`, {
    method: params.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(params.token ? { Authorization: `Bearer ${params.token}` } : {}),
    },
    ...(params.body !== undefined ? { body: JSON.stringify(params.body) } : {}),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  return { response, payload };
};

const issueToken = (overrides?: Record<string, unknown>) =>
  jwt.sign(
    {
      userId: "user-1",
      organizationId: "org-1",
      userRole: "ADMIN",
      ...overrides,
    },
    jwtSecret
  );

const applyPrismaStubs = (
  setup: (stub: (obj: any, key: string, impl: (...args: any[]) => any) => void) => void
) => {
  const restorers: Array<() => void> = [];

  const stub = (obj: any, key: string, impl: (...args: any[]) => any) => {
    const original = obj[key];
    obj[key] = impl;
    restorers.push(() => {
      obj[key] = original;
    });
  };

  setup(stub);

  return () => {
    restorers.reverse().forEach((restore) => restore());
  };
};

test("GET /api/moments/categories returns 7 phase-1 categories", async () => {
  await ensureRuntime();
  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const { response, payload } = await requestJson({
      baseUrl,
      path: "/api/moments/categories",
      token: issueToken(),
    });

    assert.equal(response.status, 200);
    assert.equal(Array.isArray(payload.categories), true);
    assert.equal(payload.categories.length, 7);
    assert.equal(payload.categories[0].key, "BIRTHDAY");
    assert.equal(payload.categories[6].key, "CUSTOM");
  } finally {
    await closeServer(server);
  }
});

test("POST /api/moments creates a moment for org admin", async () => {
  await ensureRuntime();
  const restore = applyPrismaStubs((stub) => {
    stub(prismaAny.person, "findMany", async () => [{ id: "person-1" }]);
    stub(prismaAny.organizationTemplate, "findFirst", async () => ({ id: "org-tpl-1" }));
    stub(prismaAny.moment, "create", async ({ data }: any) => ({
      id: "moment-1",
      title: data.title,
      category: data.category,
      eventDate: data.eventDate,
      recurrenceRule: data.recurrenceRule,
      deliveryChannels: data.deliveryChannels,
      status: data.status,
      ownerType: "ORGANIZATION",
      ownerOrganizationId: data.ownerOrganizationId,
      ownerUserId: data.ownerUserId,
      template: {
        id: data.templateId || "tpl-1",
        name: "Default Template",
        subject: "Hello {{first_name}}",
        channels: ["email"],
        type: "PLAIN_TEXT",
      },
      recipients: [
        {
          person: {
            id: "person-1",
            fullName: "Ada Lovelace",
            firstName: "Ada",
            email: "ada@example.com",
            phone: null,
            optedOut: false,
          },
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  });

  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const { response, payload } = await requestJson({
      baseUrl,
      method: "POST",
      path: "/api/moments",
      token: issueToken(),
      body: {
        title: "Wedding Anniversary",
        category: "ANNIVERSARY",
        personIds: ["person-1"],
        eventDate: "2026-11-20",
        recurrenceRule: "ANNUAL",
        deliveryChannels: ["email", "sms"],
        templateId: "tpl-1",
        status: "ACTIVE",
      },
    });

    assert.equal(response.status, 201);
    assert.equal(payload.moment.title, "Wedding Anniversary");
    assert.equal(payload.moment.category, "ANNIVERSARY");
    assert.deepEqual(payload.moment.deliveryChannels, ["email", "sms"]);
    assert.equal(payload.moment.recipients.length, 1);
  } finally {
    await closeServer(server);
    restore();
  }
});

test("POST /api/moments rejects custom recurrence in phase 1", async () => {
  await ensureRuntime();
  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const { response, payload } = await requestJson({
      baseUrl,
      method: "POST",
      path: "/api/moments",
      token: issueToken(),
      body: {
        title: "Memory Day",
        category: "REMEMBRANCE_DAY",
        personIds: ["person-1"],
        eventDate: "2026-09-09",
        recurrenceRule: "CUSTOM",
        deliveryChannels: ["email"],
      },
    });

    assert.equal(response.status, 400);
    assert.match(String(payload.error), /Custom recurrence/i);
  } finally {
    await closeServer(server);
  }
});

test("POST /api/moments blocks viewer mutation", async () => {
  await ensureRuntime();
  const restore = applyPrismaStubs((stub) => {
    stub(prismaAny.user, "findFirst", async () => ({ role: "VIEWER" }));
  });

  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const { response, payload } = await requestJson({
      baseUrl,
      method: "POST",
      path: "/api/moments",
      token: issueToken({ userRole: "VIEWER" }),
      body: {
        title: "Graduation Day",
        category: "GRADUATION",
        personIds: ["person-1"],
        eventDate: "2026-07-01",
        recurrenceRule: "ONE_TIME",
        deliveryChannels: ["email"],
      },
    });

    assert.equal(response.status, 403);
    assert.match(String(payload.error), /Admin role is required/i);
  } finally {
    await closeServer(server);
    restore();
  }
});

test("GET /api/moments applies org scope and filters", async () => {
  await ensureRuntime();
  let capturedWhere: any;
  const restore = applyPrismaStubs((stub) => {
    stub(prismaAny.moment, "findMany", async ({ where }: any) => {
      capturedWhere = where;
      return [];
    });
  });

  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const { response, payload } = await requestJson({
      baseUrl,
      path: "/api/moments?status=ACTIVE&category=CUSTOM",
      token: issueToken(),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(payload.moments, []);
    assert.equal(capturedWhere.ownerOrganizationId, "org-1");
    assert.equal(capturedWhere.status, "ACTIVE");
    assert.equal(capturedWhere.category, "CUSTOM");
  } finally {
    await closeServer(server);
    restore();
  }
});
