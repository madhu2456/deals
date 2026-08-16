import type { Metadata } from "next";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { SubmitDealForm } from "./SubmitDealForm";
import { getCategories } from "@/lib/data";
import { JsonLd, webPageSchema } from "@/lib/seo/json-ld";
import { absoluteUrl, defaultOgImages, SITE_NAME } from "@/lib/site";

export const dynamic = "force-dynamic";

const submitDescription = `Share a verified discount, promo code, or offer. Submissions are reviewed before they appear on ${SITE_NAME}.`;

export const metadata: Metadata = {
  title: "Submit a Deal or Coupon Code",
  description: submitDescription,
  alternates: { canonical: "/submit" },
  openGraph: {
    title: "Submit a Deal or Coupon Code",
    description: submitDescription,
    url: absoluteUrl("/submit"),
    images: defaultOgImages(),
  },
  robots: {
    index: false,
    follow: true,
  },
};

export default async function SubmitPage() {
  const categories = await getCategories();

  return (
    <>
      <JsonLd
        data={webPageSchema({
          title: "Submit a Deal",
          description:
            "Share a discount or coupon code for community review and publication.",
          path: "/submit",
        })}
      />
      <Header />
      <main id="main-content" className="flex-1">
        <div className="border-b border-border bg-card/30 px-4 py-10 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Submit a deal or coupon code
            </h1>
            <p className="mt-3 text-pretty text-muted-foreground">
              Found a great discount? Share the brand, link, and details. We review every submission before it appears publicly.
            </p>
          </div>
        </div>

        <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
          <SubmitDealForm categories={categories} />
        </div>
      </main>
      <Footer />
    </>
  );
}
