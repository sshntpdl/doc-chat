import AsyncStorage from "@react-native-async-storage/async-storage";
import { createBrowserClient } from "@docchat/supabase";

export const supabase = createBrowserClient(AsyncStorage);
