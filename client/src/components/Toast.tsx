import { CheckCircle2, Film, Sparkles } from 'lucide-react';

interface ToastProps {
  message: string;
  type?: 'success' | 'info' | 'play';
}

export function Toast({ message, type = 'info' }: ToastProps) {
  return (
    <div className={`ott-toast-container toast-type-${type}`} role="status">
      <div className="toast-icon">
        {type === 'play' ? (
          <Film size={17} />
        ) : type === 'success' ? (
          <CheckCircle2 size={17} />
        ) : (
          <Sparkles size={17} />
        )}
      </div>
      <span className="toast-message">{message}</span>
    </div>
  );
}
