import { useAsset } from '../db/assets';

/** Shows a stored image by asset id (renders nothing while loading or if missing). */
export function AssetImage({ id, className, alt = '' }: { id?: string; className?: string; alt?: string }) {
  const asset = useAsset(id);
  if (!asset) return null;
  return <img src={asset.dataUrl} alt={alt} className={className} loading="lazy" decoding="async" />;
}
