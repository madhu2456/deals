import type { Metadata } from "next";

/** Admin is private — never index in search or AI crawlers via meta robots */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
  title: {
    default: "Admin",
    template: "%s | Deals Admin",
  },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
