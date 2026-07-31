import { supabase } from "@/lib/supabase";

export async function ensurePlayerProfile(
  playerId: string,
  fallbackName = "MovieBuff"
): Promise<void> {
  const suffix = playerId.slice(0, 6).toUpperCase();

  const { data, error } = await supabase
    .from("profiles")
    .select("display_name,username")
    .eq("id", playerId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (data.display_name || data.username) {
    return;
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      display_name: `${fallbackName}${suffix}`,
      username: `moviebuff_${suffix.toLowerCase()}`,
    })
    .eq("id", playerId);

  if (updateError) {
    throw new Error(updateError.message);
  }
}
