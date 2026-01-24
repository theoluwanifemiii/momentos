import { PrismaClient } from '@prisma/client';

export type OnboardingStepStatus = 'locked' | 'active' | 'done';

export type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  route: 'people' | 'templates' | 'settings';
  status: OnboardingStepStatus;
  nextStepId?: string;
};

type OnboardingState = {
  steps: OnboardingStep[];
  currentStepId: string;
  completedSteps: string[];
  progress: {
    completed: number;
    total: number;
  };
  hasFirstSend: boolean;
  hasPeople: boolean;
};

const STEP_ORDER = [
  'add_people',
  'choose_template',
  'configure_settings',
  'send_test_email',
  'activate_automation',
];

const STEP_META: Record<string, Omit<OnboardingStep, 'status' | 'nextStepId'>> = {
  add_people: {
    id: 'add_people',
    title: 'Add people',
    description: 'Upload a CSV or add people manually.',
    route: 'people',
  },
  choose_template: {
    id: 'choose_template',
    title: 'Choose a template',
    description: 'Set your default email template.',
    route: 'templates',
  },
  configure_settings: {
    id: 'configure_settings',
    title: 'Configure send time',
    description: 'Set timezone, send time, and sender email.',
    route: 'settings',
  },
  send_test_email: {
    id: 'send_test_email',
    title: 'Send a test email',
    description: 'Send a test to confirm delivery.',
    route: 'templates',
  },
  activate_automation: {
    id: 'activate_automation',
    title: 'Activate automation',
    description: 'Turn on automated birthday sends.',
    route: 'settings',
  },
};

async function ensureProgress(prisma: PrismaClient, organizationId: string) {
  const existing = await prisma.onboardingProgress.findUnique({
    where: { organizationId },
  });

  if (existing) return existing;

  return prisma.onboardingProgress.create({
    data: {
      organizationId,
      completedSteps: [],
    },
  });
}

export async function computeOnboardingState(prisma: PrismaClient, organizationId: string): Promise<OnboardingState> {
  const [progress, org, peopleCount, defaultTemplate, totalSuccessfulDeliveries] =
    await Promise.all([
      ensureProgress(prisma, organizationId),
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: {
          timezone: true,
          emailFromAddress: true,
          birthdaySendHour: true,
          birthdaySendMinute: true,
        },
      }),
      prisma.person.count({
        where: { organizationId, optedOut: false },
      }),
      prisma.organizationTemplate.findFirst({
        where: { organizationId, isDefault: true, isActive: true },
      }),
      prisma.deliveryLog.count({
        where: {
          organizationId,
          status: { in: ['SENT', 'DELIVERED'] },
        },
      }),
    ]);

  const hasPeople = peopleCount > 0;
  const hasTemplate = Boolean(defaultTemplate);
  const fallbackFromEmail =
    process.env.DEFAULT_FROM_EMAIL || 'notifications@mail.usemomentos.xyz';
  const hasSettings =
    Boolean(org?.emailFromAddress || fallbackFromEmail) &&
    org?.birthdaySendHour !== null &&
    org?.birthdaySendMinute !== null &&
    Boolean(org?.timezone);
  const hasTestEmail = Boolean(progress.testEmailSentAt);
  const hasAutomation = Boolean(progress.automationActivatedAt);

  const computedDone = new Set<string>();
  if (hasPeople) computedDone.add('add_people');
  if (hasTemplate) computedDone.add('choose_template');
  if (hasSettings) computedDone.add('configure_settings');
  if (hasTestEmail) computedDone.add('send_test_email');
  if (hasAutomation) computedDone.add('activate_automation');

  const steps: OnboardingStep[] = [];
  let currentStepId = STEP_ORDER[0];
  let activeFound = false;

  STEP_ORDER.forEach((stepId, index) => {
    const done = computedDone.has(stepId);
    let status: OnboardingStepStatus = 'locked';
    if (done) {
      status = 'done';
    } else if (!activeFound) {
      status = 'active';
      activeFound = true;
      currentStepId = stepId;
    }

    steps.push({
      ...STEP_META[stepId],
      status,
      nextStepId: STEP_ORDER[index + 1],
    });
  });

  const completedSteps = steps.filter((step) => step.status === 'done').map((step) => step.id);

  if (completedSteps.join('|') !== progress.completedSteps.join('|')) {
    await prisma.onboardingProgress.update({
      where: { organizationId },
      data: { completedSteps },
    });
  }

  return {
    steps,
    currentStepId,
    completedSteps,
    progress: {
      completed: completedSteps.length,
      total: STEP_ORDER.length,
    },
    hasFirstSend: totalSuccessfulDeliveries > 0,
    hasPeople,
  };
}

export async function markOnboardingStep(
  prisma: PrismaClient,
  organizationId: string,
  stepId: string
) {
  const progress = await ensureProgress(prisma, organizationId);
  const data: Record<string, Date> = {};

  if (stepId === 'send_test_email' && !progress.testEmailSentAt) {
    data.testEmailSentAt = new Date();
  }

  if (stepId === 'activate_automation' && !progress.automationActivatedAt) {
    data.automationActivatedAt = new Date();
  }

  if (Object.keys(data).length > 0) {
    await prisma.onboardingProgress.update({
      where: { organizationId },
      data,
    });
  }

  return computeOnboardingState(prisma, organizationId);
}
