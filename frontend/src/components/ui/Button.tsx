import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'ds-btn-primary',
  secondary: 'ds-btn-secondary',
  danger: 'ds-btn-danger',
  ghost: 'ds-btn-ghost',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'ds-btn-sm',
  md: 'ds-btn-md',
};

const spinnerColor: Record<ButtonVariant, string> = {
  primary: '#ffffff',
  secondary: '#475569',
  danger: '#ffffff',
  ghost: '#475569',
};

function Spinner({ color }: { color: string }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="ds-btn-spinner"
      aria-hidden="true"
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="8 6"
      />
    </svg>
  );
}

export default function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  disabled,
  className,
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn('ds-btn', sizeClasses[size], variantClasses[variant], fullWidth && 'w-full', className)}
      {...props}
    >
      {loading && <Spinner color={spinnerColor[variant]} />}
      {children}
    </button>
  );
}
