/** YOU + origin: the gilded YOU is the seed; "rigin" grows from it. */
export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span className={`inline-flex items-baseline ${size === 'lg' ? 'text-4xl md:text-5xl' : 'text-2xl'}`} aria-label="YOUrigin">
      <span aria-hidden className="font-display font-bold tracking-[0.04em] text-gold" style={{ fontSize: '0.92em' }}>
        YOU
      </span>
      <span aria-hidden className="font-serif font-medium text-rigin">
        rigin
      </span>
    </span>
  );
}
