type LogoMarkProps = {
  size?: number;
  className?: string;
  color?: string;
};

export function LogoMark({ size = 28, className = '', color = '#0f172a' }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <circle cx="24" cy="24" r="16.5" stroke={color} strokeWidth="7" />
    </svg>
  );
}

export function LogoMarkInverse({ size = 28, className = '' }: Omit<LogoMarkProps, 'color'>) {
  return (
    <div
      className={`flex items-center justify-center rounded-lg bg-slate-900 ${className}`}
      style={{ width: size, height: size }}
    >
      <LogoMark size={size * 0.62} color="#ffffff" />
    </div>
  );
}
