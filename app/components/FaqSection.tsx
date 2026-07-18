import { HOME_FAQS } from "@/lib/seo/json-ld";

export function FaqSection({
  faqs = HOME_FAQS,
  heading = "Frequently asked questions",
  id = "faq",
}: {
  faqs?: { question: string; answer: string }[];
  heading?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8"
      aria-labelledby={`${id}-heading`}
    >
      <h2
        id={`${id}-heading`}
        className="text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
      >
        {heading}
      </h2>
      <p className="mt-2 text-muted-foreground">
        Straight answers about how Deals works — written so you (and search engines) can extract them easily.
      </p>

      <dl className="mt-8 space-y-4">
        {faqs.map((faq) => (
          <div
            key={faq.question}
            className="rounded-2xl border border-border bg-card p-5 surface-elevated"
          >
            <dt className="text-base font-semibold text-foreground">
              <h3 className="text-base font-semibold leading-snug">{faq.question}</h3>
            </dt>
            <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {faq.answer}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
