// FILE: /apps/web/app/dashboard/page.tsx
//
// Server Component — fetches documents on the server before sending HTML.
//
// WHY SERVER COMPONENT:
//   - No loading spinner on initial page load (data is inline in the HTML)
//   - No client-side fetch on mount (faster perceived performance)
//   - The document list is rendered into the HTML before it reaches the
//     browser, so the <DocumentGrid> client component has real data to
//     hydrate with immediately.
//
// AUTH STRATEGY:
//   Middleware already redirects unauthenticated requests, but we perform
//   a second server-side check here for defence-in-depth — a misconfigured
//   middleware matcher should not expose the dashboard.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@docchat/supabase";
import { DocumentGrid } from "@/components/dashboard/DocumentGrid";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import type { Document, DocumentStatus, DocumentType } from "@docchat/types";

// ─── RAW DB ROW TYPE ──────────────────────────────────────────────────────────

/**
 * Shape of a row returned by the documents SELECT query.
 * Column names are snake_case (Postgres convention) — we map them to the
 * camelCase Document domain type before passing them to client components.
 */
interface RawDocumentRow {
  id: string;
  user_id: string;
  name: string;
  size: number;
  type: DocumentType;
  status: DocumentStatus;
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

// ─── MAPPERS ──────────────────────────────────────────────────────────────────

function mapDocument(row: RawDocumentRow): Document {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    size: row.size,
    type: row.type,
    status: row.status,
    chunkCount: row.chunk_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── GREETING HELPERS ─────────────────────────────────────────────────────────

type TimeOfDay = "morning" | "afternoon" | "evening";

function getTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

const GREETING_MAP: Record<TimeOfDay, string> = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
};

function buildGreeting(timeOfDay: TimeOfDay): string {
  return GREETING_MAP[timeOfDay];
}

function resolveDisplayName(
  userMeta: Record<string, string> | null,
  email: string | undefined,
): string {
  const fullName =
    userMeta !== null && typeof userMeta["full_name"] === "string"
      ? userMeta["full_name"]
      : undefined;
  return fullName?.split(" ")[0] ?? email?.split("@")[0] ?? "there";
}

function buildDocumentCountLabel(count: number): string {
  if (count === 0) return "Upload your first document to get started.";
  return `${count} document${count !== 1 ? "s" : ""} in your knowledge base`;
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);

  // Defence-in-depth auth check (middleware is the primary guard)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  // Fetch documents server-side so the grid renders without a loading state
  const { data: rawDocs } = await supabase
    .from("documents")
    .select(
      "id, user_id, name, size, type, status, chunk_count, created_at, updated_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .returns<RawDocumentRow[]>();

  const documents: Document[] = (rawDocs ?? []).map(mapDocument);

  // Greeting
  const timeOfDay = getTimeOfDay();
  const greeting = buildGreeting(timeOfDay);
  const displayName = resolveDisplayName(
    (user.user_metadata as Record<string, string>) ?? null,
    user.email,
  );

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <DashboardNav user={user} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome header */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-[var(--color-foreground)]">
            {greeting}, {displayName} 👋
          </h1>
          <p className="mt-1 text-[var(--color-muted)]">
            {buildDocumentCountLabel(documents.length)}
          </p>
        </div>

        {/* DocumentGrid is a Client Component — handles upload, delete, search */}
        <DocumentGrid initialDocuments={documents} />
      </main>
    </div>
  );
}
