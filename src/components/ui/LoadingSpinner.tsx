export function LoadingSpinner({
  size = 20,
  className = ''
}: {
  size?: number;
  className?: string;
}) {
  const spinnerStyle = { width: size, height: size, borderWidth: size / 7 };

  return (
    <div
      className={`loading-spinner${className ? ` ${className}` : ''}`}
      style={spinnerStyle}
      role="status"
      aria-live="polite"
    />
  );
}
