// FILE: /apps/mobile/src/supabase.ts
// Mobile-specific Supabase client wired to AsyncStorage.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createBrowserClient } from "@docchat/supabase";

// AsyncStorage matches the SupabaseStorage interface exactly
export const supabase = createBrowserClient(AsyncStorage);
