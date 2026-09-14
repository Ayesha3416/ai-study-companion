import { createAdminClient } from "@/lib/supabase/admin";

// PRD §37: the event model should support new event types without major
// architectural changes — this union is the only place that needs updating
// to add one; the table itself has no CHECK constraint.
export type ActivityEventType =
  | "space_created"
  | "project_created"
  | "material_uploaded"
  | "material_processing_started"
  | "material_processing_completed"
  | "material_processing_failed"
  | "tutor_conversation_started"
  | "tutor_question_asked"
  | "quiz_started"
  | "quiz_question_answered"
  | "quiz_completed"
  | "mastery_updated"
  | "recommendation_generated"
  | "project_accessed";

/**
 * Records a piece of activity. Always writes via the service-role admin
 * client (same pattern as material processing status updates) since this
 * gets called from many different execution contexts — user-scoped server
 * actions, Inngest background jobs with no user session, etc.
 *
 * Deliberately swallows its own errors (logs, doesn't throw): activity
 * tracking is secondary to whatever feature it's attached to, and a logging
 * hiccup must never break the actual user-facing action (uploading a
 * material, answering a quiz question, etc.) it's recording.
 */
export async function recordActivityEvent({
  ownerId,
  eventType,
  projectId,
  spaceId,
  metadata,
}: {
  ownerId: string;
  eventType: ActivityEventType;
  projectId?: string;
  spaceId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("activity_events").insert({
      owner_id: ownerId,
      project_id: projectId ?? null,
      space_id: spaceId ?? null,
      event_type: eventType,
      metadata: metadata ?? {},
    });
    if (error) {
      console.error("Failed to record activity event:", eventType, error);
    }
  } catch (error) {
    console.error("Failed to record activity event:", eventType, error);
  }
}
