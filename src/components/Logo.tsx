/** YOU + origin: the capitalised YOU is the seed; "rigin" grows from it. */
export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span className={`inline-flex items-baseline ${size === 'lg' ? 'text-4xl md:text-5xl' : 'text-2xl'}`} aria-label="YOUrigin">
      <span aria-hidden className="font-sans font-bold tracking-[0.06em] text-accent" style={{ fontSize: '0.78em' }}>
        YOU
      </span>
      <span aria-hidden className="font-serif italic text-ink">
        rigin
      </span>
    </span>
  );
}
