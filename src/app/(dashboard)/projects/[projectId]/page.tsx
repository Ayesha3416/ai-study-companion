export const dynamic = "force-dynamic"; // material status changes frequently once Step 7 (background processing) lands

// This page calls getOrGenerateRecommendation() below, which (when the
// last recommendation is more than 10 minutes old) runs a full Growth
// Analysis over the project's entire history and then makes a live AI
// call, synchronously, inside the render — the same shape of blocking
// AI call the Tutor conversation page already has, and already set
// maxDuration for (see that file's comment). This page was missing the
// same fix. For a brand-new project with little history that call is
// fast and stays under the platform's default execution timeout; for a
// project with a lot of accumulated materials/quizzes/growth data (e.g.
// an account used for extended testing) the same call does meaningfully
// more work and can cross that default limit, getting killed mid-request
// by the platform — which surfaces to the browser as a generic failure,
// caught by error.tsx, with no indication it was actually a timeout.
export const maxDuration = 60;

import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProject } from "@/app/(dashboard)/spaces/[spaceId]/projects/actions";
import { isNotFoundError } from "@/lib/supabase/errors";
import { listMaterialsForProject } from "./materials/actions";
import { UploadMaterialForm } from "./materials/upload-material-form";
import { MaterialsList } from "./materials/materials-list";
import { recordActivityEvent } from "@/lib/activity/events";
import { getOrGenerateRecommendation } from "@/lib/ai/recommendation";

export default async function ProjectDashboardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  let project;
  try {
    project = await getProject(projectId);
  } catch (error) {
    // Only a genuine "this project doesn't exist" is a 404 — anything else
    // (network blip, a momentary auth/cookie hiccup) rethrows to the
    // nearest error.tsx instead of falsely telling the user it's gone.
    // See src/lib/supabase/errors.ts for why this distinction matters.
    if (isNotFoundError(error)) notFound();
    throw error;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    // Activity tracking is a nice-to-have, not core to the page rendering
    // correctly — same principle PRD §49 already applies to the
    // recommendation call below. A transient failure here (a network
    // blip, a brief auth/cookie timing hiccup during the exact re-render
    // this page's own Upload PDF action triggers) shouldn't take down a
    // page whose actual content (the project + materials the person just
    // uploaded) loaded fine.
    try {
      await recordActivityEvent({
        ownerId: user.id,
        eventType: "project_accessed",
        projectId,
      });
    } catch (error) {
      console.error("Failed to record project_accessed activity:", error);
    }
  }

  // Same reasoning as above: the materials list is important, but a
  // transient failure reading it shouldn't crash the whole dashboard when
  // the project itself (already fetched above) is fine — degrade to an
  // empty list and let the client-side poll in MaterialsList pick it up
  // moments later, rather than showing the user a dead-end error page for
  // what's very likely a momentary blip, not a real problem with their
  // data.
  let materials: Awaited<ReturnType<typeof listMaterialsForProject>> = [];
  try {
    materials = await listMaterialsForProject(projectId);
  } catch (error) {
    console.error("Failed to list materials for project:", error);
  }

  // Only bother generating a recommendation once there's at least one
  // material — an empty new project has nothing meaningful to recommend,
  // and skipping avoids wasting an AI call on every visit to a fresh
  // project. A failure here shouldn't break the rest of the dashboard
  // (PRD §49), so it's wrapped rather than left to throw.
  let recommendation: { message: string } | null = null;
  if (materials.length > 0) {
    try {
      recommendation = await getOrGenerateRecommendation(projectId);
    } catch (error) {
      console.error("Failed to generate recommendation:", error);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8 space-y-8">
      <div>
        <Link
          href={`/spaces/${project.space_id}`}
          className="text-sm text-neutral-500 hover:underline"
        >
          ← Back to Space
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{project.name}</h1>
        {project.description && (
          <p className="mt-1 text-sm text-neutral-500">
            {project.description}
          </p>
        )}
        {project.goal && (
          <p className="mt-2 text-sm">
            <span className="font-medium">Goal: </span>
            {project.goal}
          </p>
        )}
      </div>

      {recommendation && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-blue-700">
            Recommended Next Step
          </p>
          <p className="mt-1 text-sm text-blue-900">{recommendation.message}</p>
        </div>
      )}

      <div>
        <h2 className="text-sm font-medium text-neutral-700 mb-2">
          Learning Materials
        </h2>
        <UploadMaterialForm projectId={projectId} />
        <MaterialsList projectId={projectId} initialMaterials={materials} />
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Link
          href={`/projects/${projectId}/tutor`}
          className="rounded-lg border p-6 text-sm hover:bg-neutral-50"
        >
          <span className="font-medium">AI Tutor →</span>
          <p className="mt-1 text-neutral-500">
            Ask questions about your materials
          </p>
        </Link>
        <Link
          href={`/projects/${projectId}/quiz`}
          className="rounded-lg border p-6 text-sm hover:bg-neutral-50"
        >
          <span className="font-medium">Adaptive Quiz →</span>
          <p className="mt-1 text-neutral-500">Test your understanding</p>
        </Link>
        <Link
          href={`/projects/${projectId}/growth`}
          className="rounded-lg border p-6 text-sm hover:bg-neutral-50"
        >
          <span className="font-medium">Growth →</span>
          <p className="mt-1 text-neutral-500">See how you&apos;re improving</p>
        </Link>
        <Link
          href={`/projects/${projectId}/analytics`}
          className="rounded-lg border p-6 text-sm hover:bg-neutral-50"
        >
          <span className="font-medium">Analytics →</span>
          <p className="mt-1 text-neutral-500">
            Activity, performance &amp; AI usage
          </p>
        </Link>
      </div>
    </div>
  );
}
