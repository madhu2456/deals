"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImeSafeInput } from "../components/ImeSafeInput";

interface DealsSearchFormProps {
  categorySlug: string;
  featuredOnly: boolean;
  search: string;
}

export function DealsSearchForm({
  categorySlug,
  featuredOnly,
  search,
}: DealsSearchFormProps) {
  return (
    <form
      action="/deals"
      role="search"
      className="mt-6 flex max-w-2xl flex-col gap-3 sm:flex-row"
    >
      <div className="relative min-w-0 flex-1">
        <label htmlFor="deals-search" className="sr-only">
          Search deals, brands, or coupon codes
        </label>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <ImeSafeInput
          id="deals-search"
          name="q"
          defaultValue={search}
          placeholder="Search deals, brands, or coupon codes…"
          className="h-11 pl-9"
          autoComplete="off"
          enterKeyHint="search"
        />
      </div>
      {categorySlug && <input type="hidden" name="category" value={categorySlug} />}
      {featuredOnly && <input type="hidden" name="featured" value="1" />}
      <Button type="submit" className="h-11 min-h-11 gap-2">
        <Search className="h-4 w-4" aria-hidden="true" />
        Search
      </Button>
    </form>
  );
}
