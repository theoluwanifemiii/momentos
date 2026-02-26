import type { ReactNode } from 'react';
import { Card, CardBody } from '../ui';

type AuthContainerProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export default function AuthContainer({ title, subtitle, children, footer }: AuthContainerProps) {
  return (
    <Card className="overflow-hidden">
      <div className="h-1.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500" />
      <CardBody className="space-y-5 p-7">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          {subtitle ? <p className="text-sm text-slate-600">{subtitle}</p> : null}
        </div>
        <div className="space-y-4">{children}</div>
        {footer ? <div className="border-t border-slate-200 pt-4 text-center text-sm">{footer}</div> : null}
      </CardBody>
    </Card>
  );
}
