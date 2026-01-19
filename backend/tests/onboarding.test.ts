import test from 'node:test';
import assert from 'node:assert/strict';
import { computeOnboardingState, markOnboardingStep } from '../src/services/onboarding';

const createPrismaMock = (options: {
  progress?: any;
  org?: any;
  peopleCount?: number;
  defaultTemplate?: any;
  deliveries?: number;
}) => {
  const updates: any[] = [];
  let progress = options.progress;

  const prisma = {
    onboardingProgress: {
      findUnique: async () => progress ?? null,
      create: async ({ data }: any) => {
        progress = { id: 'progress-id', ...data };
        return progress;
      },
      update: async ({ data }: any) => {
        updates.push(data);
        progress = { ...progress, ...data };
        return progress;
      },
    },
    organization: {
      findUnique: async () => options.org ?? null,
    },
    person: {
      count: async () => options.peopleCount ?? 0,
    },
    template: {
      findFirst: async () => options.defaultTemplate ?? null,
    },
    deliveryLog: {
      count: async () => options.deliveries ?? 0,
    },
  };

  return { prisma, updates, getProgress: () => progress };
};

test('computeOnboardingState sets next active step', async () => {
  const { prisma } = createPrismaMock({
    progress: { completedSteps: [] },
    org: {
      timezone: 'UTC',
      emailFromAddress: 'hello@example.com',
      birthdaySendHour: 9,
      birthdaySendMinute: 0,
    },
    peopleCount: 1,
    defaultTemplate: { id: 'template-1' },
    deliveries: 0,
  });

  const state = await computeOnboardingState(prisma as any, 'org-1');
  assert.equal(state.currentStepId, 'send_test_email');
  assert.equal(state.steps.find((step) => step.id === 'send_test_email')?.status, 'active');
  assert.equal(state.steps.find((step) => step.id === 'configure_settings')?.status, 'done');
});

test('computeOnboardingState recomputes completed steps on load', async () => {
  const { prisma, updates } = createPrismaMock({
    progress: { completedSteps: [] },
    org: {
      timezone: 'UTC',
      emailFromAddress: 'hello@example.com',
      birthdaySendHour: 9,
      birthdaySendMinute: 0,
    },
    peopleCount: 2,
    defaultTemplate: { id: 'template-1' },
    deliveries: 0,
  });

  const state = await computeOnboardingState(prisma as any, 'org-1');
  assert.ok(state.completedSteps.includes('add_people'));
  assert.ok(state.completedSteps.includes('choose_template'));
  assert.ok(state.completedSteps.includes('configure_settings'));
  assert.ok(updates.length > 0);
});

test('markOnboardingStep stores test email timestamps', async () => {
  const { prisma, getProgress } = createPrismaMock({
    progress: { completedSteps: [], testEmailSentAt: null },
    org: {
      timezone: 'UTC',
      emailFromAddress: 'hello@example.com',
      birthdaySendHour: 9,
      birthdaySendMinute: 0,
    },
    peopleCount: 0,
    defaultTemplate: null,
    deliveries: 0,
  });

  const state = await markOnboardingStep(prisma as any, 'org-1', 'send_test_email');
  assert.ok(state.completedSteps.includes('send_test_email'));
  assert.ok(getProgress()?.testEmailSentAt);
});
