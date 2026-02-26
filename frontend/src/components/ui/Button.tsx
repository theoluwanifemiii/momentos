import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
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

export default function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn('ds-btn', sizeClasses[size], variantClasses[variant], fullWidth && 'w-full', className)}
      {...props}
    />
  );
}
