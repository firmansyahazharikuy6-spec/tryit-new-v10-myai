interface BrandMarkProps {
  variant?: 'myai' | 'myra';
  className?: string;
}

export function BrandMark({ variant = 'myai', className = 'w-6 h-6' }: BrandMarkProps) {
  if (variant === 'myra') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className={className}
      >
        <path
          d="M12 2.75L20.25 7.5V16.5L12 21.25L3.75 16.5V7.5L12 2.75Z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <path
          d="M12 7L16.5 12L12 17L7.5 12L12 7Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 28 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M3 20V5.5L9.5 12L14 7.5L18.5 12L25 5.5V20"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.75 20V11L14 18.25L21.25 11V20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.7"
      />
    </svg>
  );
}
