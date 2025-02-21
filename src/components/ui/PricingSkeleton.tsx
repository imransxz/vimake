import { Skeleton } from "./skeleton";

export function PricingSkeleton() {
  return (
    <div className="w-full max-w-7xl mx-auto p-6 space-y-24 pt-16">
      {/* Header */}
      <div className="space-y-2 text-center">
        <Skeleton className="h-6 w-32 mx-auto" /> {/* Pour le tag "Pricing" */}
        <Skeleton className="h-12 w-96 mx-auto" /> {/* Pour le titre */}
        <Skeleton className="h-6 w-[600px] mx-auto" /> {/* Pour la description */}
      </div>

      {/* Toggle Monthly/Yearly */}
      <div className="flex justify-center">
        <Skeleton className="h-10 w-48" />
      </div>

      {/* Prix Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-[600px] rounded-2xl" />
        ))}
      </div>

      {/* FAQ Section */}
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-10 w-48 mx-auto mb-8" /> {/* FAQ Title */}
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
} 