export function slugify(text: string): string {
  return text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function generateUniqueSlug(title: string, existingSlugs: string[] = []): string {
  const existing = new Set(existingSlugs);
  const base = slugify(title) || "deal";
  if (!existing.has(base)) return base;

  let counter = 2;
  let candidate = `${base}-${counter}`;
  while (existing.has(candidate)) {
    counter++;
    candidate = `${base}-${counter}`;
  }
  return candidate;
}
