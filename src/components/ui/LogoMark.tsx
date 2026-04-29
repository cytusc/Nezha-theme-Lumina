import { useEffect, useState, type ReactNode } from "react";

interface LogoMarkProps {
  src?: string | null;
  alt: string;
  size?: number;
  fallback: ReactNode;
}

export function LogoMark({
  src,
  alt,
  size = 13,
  fallback,
}: LogoMarkProps) {
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setLoadFailed(false);
  }, [src]);

  if (!src || loadFailed) {
    return <span className="instance-logo-mark">{fallback}</span>;
  }

  return (
    <span
      className="instance-logo-mark"
      aria-label={alt}
      title={alt}
      style={{ width: size, height: size }}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        fetchPriority="low"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          display: "block",
        }}
        onError={() => setLoadFailed(true)}
      />
    </span>
  );
}
