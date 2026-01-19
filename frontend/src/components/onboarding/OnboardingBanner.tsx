type OnboardingBannerProps = {
  title: string;
  message: string;
  onDismiss?: () => void;
};

export default function OnboardingBanner({ title, message, onDismiss }: OnboardingBannerProps) {
  return (
    <div className="bg-green-50 text-green-800 px-4 py-3 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-sm">{message}</p>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-sm text-green-800 underline"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
