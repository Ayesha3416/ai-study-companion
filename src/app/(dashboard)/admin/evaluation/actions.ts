"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { runEvaluation } from "@/lib/eval/runner";

// Deliberately NOT run automatically on page load — every case here makes
// real Groq calls (billed, logged to ai_requests/Langfuse same as any
// other AI request), so a run only happens when an admin explicitly asks
// for one, same as any other action with a real cost attached elsewhere
// in this app.
export async function triggerEvalRun() {
  const admin = await requireAdmin();
  await runEvaluation(admin.id);
  revalidatePath("/admin/evaluation");
}
