// FILE: /apps/web/app/dashboard/page.tsx
//
// Server Component — fetches documents on the server before sending HTML.
// This means:
//   - No loading spinner on initial page load (data is inline in the HTML)
//   - No client-side fetch on mount (faster perceived performance)
//   - SEO: document list is in the HTML (though dashboard is auth-gated)
//
// We pass the server-fetched data to the <DocumentGrid> Client Component
// which wires up interactivity (upload, delete, search).

import { cookies }           from "next/headers";
import { redirect }          from "next/navigation";
import { createServerClient } from "@docchat/supabase";
import { DocumentGrid }      from "@/components/dashboard/DocumentGrid";
import { DashboardNav }      from "@/components/dashboard/DashboardNav";
import type { Document }     from "@docchat/types";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const supabase    = createServerClient(cookieStore);

  // Server-side auth check (middleware already handles redirect,
  // but we double-check here for defense in depth)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Fetch documents server-side
  const { data: rawDocs } = await supabase
    .from("documents")
    .select("id, user_id, name, size, type, status, chunk_count, error_message, created_at, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const documents: Document[] = (rawDocs ?? []).map((d: any) => ({
    id:         d.id,
    userId:     d.user_id,
    name:       d.name,
    size:       d.size,
    type:       d.type,
    status:     d.status,
    chunkCount: d.chunk_count,
    createdAt:  d.created_at,
    updatedAt:  d.updated_at,
  }));

  // Time-aware greeting
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const name     = user.user_metadata?.full_name?.split(" ")[0] ?? user.email?.split("@")[0] ?? "there";

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <DashboardNav user={user} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome header */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-[var(--color-foreground)]">
            {greeting}, {name} 👋
          </h1>
          <p className="mt-1 text-[var(--color-muted)]">
            {documents.length === 0
              ? "Upload your first document to get started."
              : `${documents.length} document${documents.length !== 1 ? "s" : ""} in your knowledge base`}
          </p>
        </div>

        {/* Client component handles search, upload, delete */}
        <DocumentGrid initialDocuments={documents} />
      </main>
    </div>
  );
}
