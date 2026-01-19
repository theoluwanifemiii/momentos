export type OnboardingStepStatus = 'locked' | 'active' | 'done';

export type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  route: 'people' | 'templates' | 'settings';
  status: OnboardingStepStatus;
  nextStepId?: string;
};

export type OnboardingState = {
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
