"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Search, Menu, X, Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { BrandLogo } from "./BrandLogo";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/deals", label: "Browse Deals", match: (path: string) => path === "/deals" || path.startsWith("/deals/") },
  { href: "/categories", label: "Categories", match: (path: string) => path.startsWith("/categories") },
  { href: "/submit", label: "Submit", match: (path: string) => path.startsWith("/submit") },
];

export function Header() {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-4 sm:gap-6">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Deals home"
          >
            <BrandLogo size="md" priority />
            <span className="hidden text-xl font-bold tracking-tight text-foreground sm:inline">
              Deals
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {navLinks.map((link) => {
              const active = link.match(pathname);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-foreground/80 hover:bg-muted hover:text-foreground"
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {searchOpen ? (
            <form
              action="/deals"
              className="hidden items-center gap-1.5 md:flex"
              onSubmit={() => setSearchOpen(false)}
              role="search"
            >
              <label htmlFor="header-search" className="sr-only">
                Search deals
              </label>
              <Input
                id="header-search"
                name="q"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search deals…"
                className="h-10 w-52 lg:w-64"
                autoComplete="off"
                enterKeyHint="search"
              />
              <Button type="submit" size="icon" variant="ghost" className="h-10 w-10" aria-label="Submit search">
                <Search className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-10 w-10"
                onClick={() => setSearchOpen(false)}
                aria-label="Close search"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </form>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="hidden h-10 w-10 md:flex"
              onClick={() => setSearchOpen(true)}
              aria-label="Open search"
            >
              <Search className="h-5 w-5" aria-hidden="true" />
            </Button>
          )}

          <Button asChild className="hidden sm:inline-flex" size="sm">
            <Link href="/submit">
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Submit a Deal
            </Link>
          </Button>

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                "h-10 w-10 md:hidden"
              )}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(20rem,100vw)] overscroll-contain">
              <SheetTitle className="sr-only">Navigation menu</SheetTitle>
              <div className="flex h-full flex-col gap-6 pt-2">
                <Link
                  href="/"
                  className="flex items-center gap-2"
                  onClick={() => setMobileOpen(false)}
                >
                  <BrandLogo size="md" />
                  <span className="text-xl font-bold tracking-tight text-foreground">
                    Deals
                  </span>
                </Link>

                <form action="/deals" className="relative" role="search">
                  <label htmlFor="mobile-search" className="sr-only">
                    Search deals
                  </label>
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="mobile-search"
                    name="q"
                    placeholder="Search deals…"
                    className="h-11 pl-9"
                    autoComplete="off"
                    enterKeyHint="search"
                  />
                </form>

                <nav className="flex flex-col gap-1" aria-label="Mobile">
                  {navLinks.map((link) => {
                    const active = link.match(pathname);
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        aria-current={active ? "page" : undefined}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          "min-h-11 rounded-xl px-3 py-3 text-base font-medium transition-colors",
                          active
                            ? "bg-primary/10 text-primary"
                            : "text-foreground/90 hover:bg-muted"
                        )}
                      >
                        {link.label}
                      </Link>
                    );
                  })}
                </nav>

                <Button asChild className="mt-auto min-h-11">
                  <Link href="/submit" onClick={() => setMobileOpen(false)}>
                    <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                    Submit a Deal
                  </Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
