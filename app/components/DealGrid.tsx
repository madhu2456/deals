import { DealCard } from "./DealCard";
import type { PublicDeal } from "@/lib/data";

interface DealGridProps {
  deals: PublicDeal[];
}

export function DealGrid({ deals }: DealGridProps) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {deals.map((deal) => (
        <DealCard key={deal.id} deal={deal} />
      ))}
    </div>
  );
}
