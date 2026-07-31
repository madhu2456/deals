import { getSiteUrl, SITE_NAME, PUBLISHER, SEO_PARTNER } from "@/lib/site";

export const dynamic = "force-static";
export const revalidate = 86400;

export async function GET() {
  const site = getSiteUrl();
  const now = new Date();
  const lastUpdate = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const body = `/* TEAM */
Developer & Designer: ${PUBLISHER.name}
Site: ${PUBLISHER.url}
Blog: ${PUBLISHER.blog}
Location: Visakhapatnam, India
Role: AI Engineer, RAG & Analytics Consultant

/* CREDITS */
SEO / AEO / GEO: ${SEO_PARTNER.name} (${SEO_PARTNER.url})
Related: Udemy Course Enroller (${PUBLISHER.udemyEnroller})

/* SITE */
Application: ${SITE_NAME}
Domain: ${site}
Last update: ${lastUpdate}
Language: English (en-IN)
Standards: HTML5, CSS3, JSON-LD, Schema.org, WAI-ARIA
Doctype: HTML5

/* TECH STACK */
Framework: Next.js (App Router), React
Database: SQLite, Prisma
UI: Tailwind CSS, shadcn/ui
Deployment: Docker, nginx, Cloudflare
Analytics: Google Tag Manager (consent-gated)
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
