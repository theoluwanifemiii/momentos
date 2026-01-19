import { OnboardingState } from '../../types/onboarding';

type OnboardingProgressProps = {
  onboarding: OnboardingState;
};

export default function OnboardingProgress({ onboarding }: OnboardingProgressProps) {
  const currentIndex = onboarding.steps.findIndex(
    (step) => step.id === onboarding.currentStepId
  );
  const fallbackStep = Math.min(onboarding.progress.total, onboarding.progress.completed + 1);
  const stepNumber = currentIndex >= 0 ? currentIndex + 1 : fallbackStep;
  const totalSteps = onboarding.progress.total;
  const percent = Math.min(100, Math.round((onboarding.progress.completed / totalSteps) * 100));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>Step {stepNumber} of {totalSteps}</span>
        <span>{onboarding.progress.completed}/{totalSteps} complete</span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-100">
        <div
          className="h-2 rounded-full bg-blue-600 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
