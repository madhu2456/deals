/**
 * Permanent keyset pagination verification (Fix #25 review): walks
 * getApprovedDealsPaginated's keyset bound against a synthetic in-memory
 * dataset — NO database required. Uses the REAL exported cursor
 * encode/decode + bound builder from lib/data.ts; only the ordering, take
 * and where-filter mechanics of the Prisma walk are replicated here
 * (sort (isFeatured, createdAt, id) DESC, PAGE_SIZE + 1 probe, nextCursor
 * from the last row of the page).
 *
 * Run: pnpm test:pagination   (or pnpm exec tsx scripts/verify-pagination.ts)
 */
import {
  PAGE_SIZE,
  dealsAfterCursorBound,
  decodeDealsCursor,
  encodeDealsCursor,
  type DealsCursor,
} from "../lib/data";

type Row = { id: string; isFeatured: boolean; createdAt: Date };
type Bound = NonNullable<Awaited<ReturnType<typeof dealsAfterCursorBound>>>;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

/** Ordering of getApprovedDealsPaginated's orderBy: (isFeatured, createdAt, id) DESC. */
function orderRows(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => {
    if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
    const aTime = a.createdAt.getTime();
    const bTime = b.createdAt.getTime();
    if (aTime !== bTime) return bTime - aTime;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

/**
 * Interpret the keyset bound (a Prisma.DealWhereInput) against an in-memory
 * row. The bound builder only ever emits OR lists of {isFeatured,
 * createdAt (lt | exact), id (lt)} conditions — if it grows a new operator
 * this evaluator must grow with it, or the walk assertions catch the drift.
 */
function matchesBound(row: Row, bound: Bound): boolean {
  if (bound.OR) {
    return bound.OR.some((cond) => matchesBound(row, cond));
  }
  if (typeof bound.isFeatured === "boolean" && row.isFeatured !== bound.isFeatured) {
    return false;
  }
  const createdAt = bound.createdAt;
  if (createdAt instanceof Date) {
    // exact-instant equality branch (createdAt: cursor.createdAt)
    if (row.createdAt.getTime() !== createdAt.getTime()) return false;
  } else if (
    createdAt &&
    typeof createdAt === "object" &&
    "lt" in createdAt &&
    createdAt.lt instanceof Date
  ) {
    if (!(row.createdAt.getTime() < createdAt.lt.getTime())) return false;
  }
  const idFilter = bound.id;
  if (
    idFilter &&
    typeof idFilter === "object" &&
    "lt" in idFilter &&
    typeof idFilter.lt === "string"
  ) {
    if (!(row.id < idFilter.lt)) return false;
  }
  return true;
}

type WalkResult = { pages: Row[][]; nextCursors: (string | null)[] };

/** One full pagination walk: decode → bound → filter → PAGE_SIZE probe → cursor. */
async function walkPages(sorted: Row[], startCursor?: string): Promise<WalkResult> {
  const pages: Row[][] = [];
  const nextCursors: (string | null)[] = [];
  let cursor: string | undefined = startCursor;
  for (let guard = 0; guard < 100; guard++) {
    const decoded = decodeDealsCursor(cursor);
    const bound = decoded ? await dealsAfterCursorBound(decoded) : null;
    const candidates = bound ? sorted.filter((r) => matchesBound(r, bound)) : sorted;
    const hasNext = candidates.length > PAGE_SIZE;
    const page = hasNext ? candidates.slice(0, PAGE_SIZE) : candidates;
    pages.push(page);
    const nextCursor = hasNext ? encodeDealsCursor(page[page.length - 1]) : null;
    nextCursors.push(nextCursor);
    if (!hasNext) return { pages, nextCursors };
    cursor = nextCursor ?? undefined;
  }
  throw new Error("FAIL: pagination walk did not terminate");
}

const flatIds = (pages: Row[][]) => pages.flat().map((r) => r.id);

/** Synthetic deals: strictly increasing createdAt, zero-padded string ids. */
function syntheticDeals(count: number, featuredIndexes: ReadonlySet<number>): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < count; i++) {
    rows.push({
      id: `deal_${String(i).padStart(3, "0")}`,
      isFeatured: featuredIndexes.has(i),
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
    });
  }
  return rows;
}

async function main() {
  // ── A: 60 rows, 8 featured interleaved → 3 pages (24/24/12), no gaps/dupes,
  //      featured all first ──
  const featuredIndexes = new Set([5, 12, 19, 27, 33, 41, 48, 55]);
  const rowsA = syntheticDeals(60, featuredIndexes);
  const sortedA = orderRows(rowsA);
  const walkA = await walkPages(sortedA);

  assert(
    walkA.pages.length === 3,
    `A: expected 3 pages, got ${walkA.pages.length}`
  );
  assert(
    walkA.pages.map((p) => p.length).join(",") === "24,24,12",
    `A: page sizes 24/24/12, got ${walkA.pages.map((p) => p.length).join(",")}`
  );
  assert(flatIds(walkA.pages).length === 60, "A: total rows across pages != 60");
  assert(
    new Set(flatIds(walkA.pages)).size === 60,
    "A: duplicate rows across pages"
  );
  assert(
    JSON.stringify(flatIds(walkA.pages)) === JSON.stringify(sortedA.map((r) => r.id)),
    "A: pages must be contiguous slices of the global sort order (no gaps)"
  );
  const byId = new Map(rowsA.map((r) => [r.id, r]));
  const featuredFlags = flatIds(walkA.pages).map((id) => byId.get(id)!.isFeatured);
  assert(
    featuredFlags.join(",") === "true,true,true,true,true,true,true,true," + Array(52).fill("false").join(","),
    "A: the 8 featured rows lead the listing, all non-featured after"
  );
  assert(walkA.nextCursors[0] !== null && walkA.nextCursors[1] !== null, "A: pages 1-2 have next cursors");
  assert(walkA.nextCursors[2] === null, "A: last page has no next cursor");

  // ── B: cursor on the last featured row → the bound admits ALL non-featured ──
  const featuredRows = sortedA.filter((r) => r.isFeatured);
  const lastFeatured = featuredRows[featuredRows.length - 1];
  const decodedFeatured = decodeDealsCursor(encodeDealsCursor(lastFeatured));
  assert(decodedFeatured?.isFeatured === true, "B: featured cursor decodes with isFeatured true");
  const boundFeatured = await dealsAfterCursorBound(decodedFeatured as DealsCursor);
  const afterFeatured = sortedA.filter((r) => matchesBound(r, boundFeatured as Bound));
  assert(
    afterFeatured.length === 52,
    `B: bound after last featured admits 52 rows, got ${afterFeatured.length}`
  );
  assert(
    afterFeatured.every((r) => !r.isFeatured),
    "B: bound after last featured admits only non-featured rows"
  );
  const walkB = await walkPages(sortedA, encodeDealsCursor(lastFeatured));
  assert(
    walkB.pages.map((p) => p.length).join(",") === "24,24,4",
    `B: walking from last featured → 24/24/4, got ${walkB.pages.map((p) => p.length).join(",")}`
  );
  assert(
    flatIds(walkB.pages).every((id) => !byId.get(id)!.isFeatured),
    "B: no featured rows after the featured cursor"
  );

  // ── C: cursor on the last non-featured (last row overall) → nothing next ──
  const lastRow = sortedA[sortedA.length - 1];
  assert(!lastRow.isFeatured, "C: last row is non-featured");
  const boundLast = await dealsAfterCursorBound(
    decodeDealsCursor(encodeDealsCursor(lastRow)) as DealsCursor
  );
  const afterLast = sortedA.filter((r) => matchesBound(r, boundLast as Bound));
  assert(afterLast.length === 0, `C: bound after last row admits 0 rows, got ${afterLast.length}`);
  const walkC = await walkPages(sortedA, encodeDealsCursor(lastRow));
  assert(walkC.pages[0].length === 0 && walkC.nextCursors[0] === null, "C: no next page after last row");

  // ── D: boundary-exact — 24 featured + 36 non-featured (featured count == PAGE_SIZE) ──
  const featuredSetD = new Set(Array.from({ length: 24 }, (_, i) => i * 2));
  const rowsD = syntheticDeals(60, featuredSetD);
  const walkD = await walkPages(orderRows(rowsD));
  assert(
    walkD.pages.map((p) => p.length).join(",") === "24,24,12",
    `D: boundary-exact pages 24/24/12, got ${walkD.pages.map((p) => p.length).join(",")}`
  );
  assert(
    walkD.pages[0].length === 24 && walkD.pages[0].every((r) => r.isFeatured),
    "D: page 1 is exactly the 24-row featured block"
  );
  assert(
    walkD.pages.slice(1).flat().every((r) => !r.isFeatured),
    "D: pages 2+ are all non-featured"
  );

  // ── E: malformed cursors decode to null (restart from page 1) ──
  assert(decodeDealsCursor(undefined) === null, "E: undefined cursor → null");
  assert(decodeDealsCursor("") === null, "E: empty cursor → null");
  assert(decodeDealsCursor("not a cursor!!") === null, "E: non-base64url cursor → null");
  assert(
    decodeDealsCursor(Buffer.from("hello", "utf8").toString("base64url")) === null,
    "E: single-part cursor → null"
  );
  assert(
    decodeDealsCursor(Buffer.from("2|2026-01-01T00:00:00.000Z|deal_000", "utf8").toString("base64url")) === null,
    "E: invalid featured flag → null"
  );
  assert(
    decodeDealsCursor(Buffer.from("1|not-a-date|deal_000", "utf8").toString("base64url")) === null,
    "E: invalid createdAt → null"
  );
  const walkE = await walkPages(sortedA, "garbage");
  assert(
    walkE.pages.length === 3 && walkE.pages[0].length === 24,
    "E: malformed cursor → walk restarts from page 1"
  );

  // ── F: id tiebreak — identical createdAt rows order by id DESC; the bound
  //      admits only strictly-lower ids past the cursor ──
  const rowsF: Row[] = [1, 2, 3, 4, 5].map((n) => ({
    id: `deal_${n}`,
    isFeatured: false,
    createdAt: new Date(Date.UTC(2026, 1, 1)),
  }));
  const sortedF = orderRows(rowsF);
  assert(
    sortedF.map((r) => r.id).join(",") === "deal_5,deal_4,deal_3,deal_2,deal_1",
    `F: id DESC tiebreak, got ${sortedF.map((r) => r.id).join(",")}`
  );
  const cursorF = encodeDealsCursor(sortedF[2]); // deal_3
  const boundF = await dealsAfterCursorBound(
    decodeDealsCursor(cursorF) as DealsCursor
  );
  const afterF = sortedF.filter((r) => matchesBound(r, boundF as Bound));
  assert(
    afterF.map((r) => r.id).join(",") === "deal_2,deal_1",
    `F: bound after deal_3 admits only lower ids, got ${afterF.map((r) => r.id).join(",")}`
  );

  // ── G: encode/decode round-trip on a real row ──
  const roundTrip = decodeDealsCursor(encodeDealsCursor(rowsA[0]));
  assert(
    roundTrip !== null &&
      roundTrip.isFeatured === rowsA[0].isFeatured &&
      roundTrip.createdAt.getTime() === rowsA[0].createdAt.getTime() &&
      roundTrip.id === rowsA[0].id,
    "G: cursor encode/decode round-trips"
  );

  console.log("OK: keyset pagination verified (24/24/12 walks, featured-first, no gaps/dupes)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
