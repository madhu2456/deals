import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Deals — Verified Deals, Coupons & Discounts";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0f0f23",
          backgroundImage:
            "radial-gradient(circle at 25% 25%, #1e1b4b 0%, #0f0f23 70%)",
        }}
      >
        {/* Badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 24px",
            borderRadius: 9999,
            backgroundColor: "rgba(99, 102, 241, 0.15)",
            border: "1px solid rgba(99, 102, 241, 0.3)",
            marginBottom: 32,
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              backgroundColor: "#a5b4fc",
            }}
          />
          <span
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: "#a5b4fc",
              letterSpacing: "0.05em",
            }}
          >
            VERIFIED DEALS
          </span>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 800,
            color: "#ffffff",
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
            textAlign: "center",
            maxWidth: 900,
            marginBottom: 16,
          }}
        >
          Deals
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 28,
            color: "rgba(255, 255, 255, 0.6)",
            textAlign: "center",
            maxWidth: 700,
            lineHeight: 1.4,
          }}
        >
          Verified coupons, discounts &amp; exclusive offers on software, SaaS,
          and more
        </div>

        {/* Domain */}
        <div
          style={{
            position: "absolute",
            bottom: 40,
            right: 60,
            fontSize: 22,
            color: "rgba(255, 255, 255, 0.3)",
            fontWeight: 500,
          }}
        >
          deals.madhudadi.in
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
