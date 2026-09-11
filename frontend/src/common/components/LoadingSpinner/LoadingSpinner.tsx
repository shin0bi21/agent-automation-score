type LoadingSpinnerProps = {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const sizeClass = {
  sm: 'h-4 w-4 border-2',
  md: 'h-[22px] w-[22px] border-2',
  lg: 'h-7 w-7 border-[3px]',
};

export default function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  return <span
    aria-hidden="true"
    className={`inline-block shrink-0 animate-spin rounded-full border-[#dedbea] border-t-[#6f56d9] [animation-duration:700ms] motion-reduce:animate-none dark:border-[#373241] dark:border-t-[#a58cff] ${sizeClass[size]}${className ? ` ${className}` : ''}`}
  />;
}
