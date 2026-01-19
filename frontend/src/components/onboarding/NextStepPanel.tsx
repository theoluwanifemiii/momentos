import OnboardingProgress from './OnboardingProgress';
import { OnboardingState } from '../../types/onboarding';

type NextStepPanelProps = {
  onboarding: OnboardingState | null;
  onSelectTab?: (tab: 'people' | 'templates' | 'settings' | 'upcoming' | 'dashboard') => void;
  message?: string;
};

export default function NextStepPanel({ onboarding, onSelectTab, message }: NextStepPanelProps) {
  if (!onboarding) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm space-y-2">
        <p className="text-xs font-semibold uppercase text-gray-500">What’s next</p>
        <p className="text-sm text-gray-700">
          We’re loading your next step. Hang tight.
        </p>
      </div>
    );
  }

  if (onboarding.progress.completed >= onboarding.progress.total) {
    return (
      <div className="bg-white border border-green-100 rounded-lg p-4 shadow-sm space-y-3">
        <p className="text-xs font-semibold uppercase text-green-600">You’re all set</p>
        <h3 className="text-lg font-semibold text-gray-900">Onboarding complete</h3>
        <p className="text-sm text-gray-600">
          Your automation is active. We’ll handle future birthdays automatically.
        </p>
        <div className="flex flex-wrap gap-3">
          {onboarding.hasFirstSend && (
            <button
              onClick={() => onSelectTab?.('upcoming')}
              className="text-sm text-green-700 underline"
            >
              View upcoming birthdays
            </button>
          )}
          <button
            onClick={() => onSelectTab?.('people')}
            className="text-sm text-green-700 underline"
          >
            Add more people
          </button>
        </div>
      </div>
    );
  }

  const currentStep = onboarding.steps.find(
    (step) => step.id === onboarding.currentStepId
  );

  if (!currentStep) return null;

  const defaultMessages: Record<string, string> = {
    add_people: 'Great start! Add your first people so we know who to celebrate.',
    choose_template: 'Pick a default template so every birthday has a message.',
    configure_settings: 'Set your send time and sender details to schedule emails.',
    send_test_email: 'Send a test email to confirm everything looks right.',
    activate_automation: 'Turn automation on so birthdays go out automatically.',
  };
  const guidanceMessage = message || defaultMessages[currentStep.id] || currentStep.description;

  return (
    <div className="bg-white border border-blue-100 rounded-lg p-4 shadow-sm space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-blue-600">What’s next</p>
          <h3 className="text-lg font-semibold text-gray-900">{currentStep.title}</h3>
          <p className="text-sm text-gray-600">{currentStep.description}</p>
          <p className="mt-2 text-sm text-green-700">{guidanceMessage}</p>
        </div>
        <button
          onClick={() => onSelectTab?.(currentStep.route)}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 self-start"
        >
          Go to {currentStep.title}
        </button>
      </div>
      <OnboardingProgress onboarding={onboarding} />
    </div>
  );
}
