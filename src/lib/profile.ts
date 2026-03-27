import { getDb } from "@/lib/db";
import { profiles } from "@/lib/db/schema";

export async function ensureProfile(user: { id: string; email: string }) {
  const db = getDb();
  await db
    .insert(profiles)
    .values({
      id: user.id,
      email: user.email,
    })
    .onConflictDoUpdate({
      target: profiles.id,
      set: { email: user.email },
    });
}
