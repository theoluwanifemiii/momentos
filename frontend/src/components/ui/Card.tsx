import type { HTMLAttributes } from 'react';
import { cn } from './cn';

type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: CardProps) {
  return <div className={cn('ds-card', className)} {...props} />;
}

export function CardHeader({ className, ...props }: CardProps) {
  return <div className={cn('ds-card-header', className)} {...props} />;
}

export function CardBody({ className, ...props }: CardProps) {
  return <div className={cn('ds-card-body', className)} {...props} />;
}
