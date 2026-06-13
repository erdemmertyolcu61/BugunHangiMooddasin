export function SkeletonPulse({ className = '' }) {
  return <div className={`animate-pulse bg-white/8 rounded-xl ${className}`} />;
}

export function SkeletonCard() {
  return (
    <div className="animate-pulse">
      <div className="aspect-[2/3] rounded-2xl bg-white/5" />
      <div className="mt-3 space-y-2 px-1">
        <div className="h-4 bg-white/8 rounded w-3/4" />
        <div className="flex items-center justify-between">
          <div className="h-3 bg-white/8 rounded w-1/5" />
          <div className="h-3 bg-white/8 rounded w-1/6" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonText({ lines = 3, className = '' }) {
  return (
    <div className={`space-y-2.5 animate-pulse ${className}`}>
      {[...Array(lines)].map((_, i) => (
        <div key={i} className={`h-3.5 bg-white/8 rounded ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  );
}

export function SkeletonListCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-white/5 bg-white/[0.02] p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-white/8" />
        <div className="flex-1 space-y-2">
          <div className="h-5 bg-white/8 rounded w-1/2" />
          <div className="h-3 bg-white/8 rounded w-1/3" />
        </div>
      </div>
      <div className="flex gap-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="w-12 h-16 rounded-lg bg-white/5" />
        ))}
      </div>
    </div>
  );
}

export function SkeletonDefterimCard() {
  return (
    <div className="animate-pulse flex gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
      <div className="w-16 h-24 rounded-xl bg-white/8 shrink-0" />
      <div className="flex-1 space-y-2.5 py-1">
        <div className="h-4 bg-white/8 rounded w-3/5" />
        <div className="h-3 bg-white/8 rounded w-2/5" />
        <div className="h-3 bg-white/8 rounded w-1/4" />
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 8, type = 'card' }) {
  const Card = type === 'list' ? SkeletonListCard : type === 'defterim' ? SkeletonDefterimCard : SkeletonCard;
  return (
    <div className={type === 'card'
      ? 'grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 sm:gap-x-10 gap-y-8 sm:gap-y-16'
      : 'space-y-4'
    }>
      {[...Array(count)].map((_, i) => <Card key={i} />)}
    </div>
  );
}
