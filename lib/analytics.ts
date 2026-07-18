/**
 * dataLayer helpers for Google Tag Manager (GTM-PT2ZHD3W).
 * Fire custom events that GTM maps to GA4 (G-THQ1ZPJ4B7).
 */

export type DataLayerEvent = {
  event: string;
  [key: string]: string | number | boolean | undefined | null;
};

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}

export function pushDataLayer(payload: DataLayerEvent) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  // Clear previous ecommerce if needed — not used yet
  window.dataLayer.push({ ...payload });
}

/** Claim / Get Deal outbound click */
export function trackGetDeal(params: {
  dealId: string;
  dealSlug?: string;
  dealTitle?: string;
  brandName?: string;
  dealUrl: string;
  couponCode?: string | null;
}) {
  pushDataLayer({
    event: "get_deal",
    deal_id: params.dealId,
    deal_slug: params.dealSlug ?? undefined,
    deal_title: params.dealTitle ?? undefined,
    brand_name: params.brandName ?? undefined,
    deal_url: params.dealUrl,
    coupon_code: params.couponCode || undefined,
    link_url: params.dealUrl,
  });
}

/** Coupon code copied */
export function trackCopyCoupon(params: {
  dealId?: string;
  dealSlug?: string;
  dealTitle?: string;
  brandName?: string;
  couponCode: string;
}) {
  pushDataLayer({
    event: "copy_coupon",
    deal_id: params.dealId,
    deal_slug: params.dealSlug,
    deal_title: params.dealTitle,
    brand_name: params.brandName,
    coupon_code: params.couponCode,
  });
}

/** Community deal submitted successfully */
export function trackSubmitDeal(params?: { categoryId?: string }) {
  pushDataLayer({
    event: "submit_deal",
    category_id: params?.categoryId,
  });
}

/** Deals search performed */
export function trackSearch(params: { searchTerm: string; resultsCount?: number }) {
  const term = params.searchTerm.trim();
  if (!term) return;
  pushDataLayer({
    event: "search",
    search_term: term,
    results_count: params.resultsCount,
  });
}

/** Featured / category filter click */
export function trackSelectContent(params: {
  contentType: string;
  contentId?: string;
  contentName?: string;
}) {
  pushDataLayer({
    event: "select_content",
    content_type: params.contentType,
    content_id: params.contentId,
    content_name: params.contentName,
  });
}
