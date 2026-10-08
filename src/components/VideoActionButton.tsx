import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

interface VideoActionButtonProps {
  children: ReactNode;
  onClick: () => void;
  icon?: ReactNode;
  ariaLabel?: string;
  className?: string;
}

export default function VideoActionButton({
  children,
  onClick,
  icon = <ArrowLeft size={18} aria-hidden="true" />,
  ariaLabel,
  className = '',
}: VideoActionButtonProps) {
  return (
    <button
      type="button"
      className={`video-action-button ${className}`.trim()}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}
