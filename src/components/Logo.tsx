import logo700 from '../assets/brand/yourigin-logo-700.webp';
import logo1400 from '../assets/brand/yourigin-logo-1400.webp';

const SIZE: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-10 w-auto',
  md: 'h-auto w-full max-w-[210px]',
  lg: 'h-auto w-full max-w-[420px]',
};

/** The gilded YOUrigin wordmark. */
export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <img
      src={logo700}
      srcSet={`${logo700} 700w, ${logo1400} 1400w`}
      sizes={size === 'lg' ? '420px' : '210px'}
      alt="YOUrigin"
      width={700}
      height={256}
      decoding="async"
      className={`block select-none ${SIZE[size]}`}
      draggable={false}
    />
  );
}
