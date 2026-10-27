import { createClient } from "@/lib/supabase/server";

/** Whether the request carries a verified Supabase session. Any failure to read it counts as signed out. */
export async function hasSession(): Promise<boolean> {
    try {
        const { data } = await (await createClient()).auth.getUser();
        return Boolean(data.user);
    } catch {
        return false;
    }
}
