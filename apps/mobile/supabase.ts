// FILE: /apps/mobile/src/supabase.ts
//
// Mobile-specific Supabase client wired to AsyncStorage.
//
// AsyncStorage is passed as the session storage adapter so that:
//   1. Sessions survive app restarts (persisted to device storage)
//   2. The auth token is available immediately on re-launch without
//      requiring the user to log in again
//   3. fetchDocuments / uploadDocument always have a valid Bearer token
//
// Previously AsyncStorage was passed to createBrowserClient() but the
// function signature accepted NO arguments — it was silently discarded,
// leaving the client with in-memory-only session storage. Every cold
// start produced an unauthenticated client, causing:
//   • Empty document library (401 on GET /api/documents)
//   • [TypeError: Network request failed] on upload (401 on POST /api/ingest
//     surfaces as a network error in RN's whatwg-fetch polyfill)

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createBrowserClient } from "@docchat/supabase";

// AsyncStorage satisfies SupabaseStorage: getItem / setItem / removeItem
export const supabase = createBrowserClient(AsyncStorage);
