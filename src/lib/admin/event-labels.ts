// Shared with the User Detail Activity Timeline (Step 27) and the
// platform-wide Admin Activity view (Step 28) — a single place to add a
// label when ActivityEventType (src/lib/activity/events.ts) gains a new
// event type, per PRD §37's "new event types can be introduced without
// requiring major architectural changes."
export const EVENT_LABELS: Record<string, string> = {
  space_created: "Created a Space",
  project_created: "Created a Project",
  project_accessed: "Opened a Project",
  material_uploaded: "Uploaded material",
  material_processing_started: "Material processing started",
  material_processing_completed: "Material processing completed",
  material_processing_failed: "Material processing failed",
  tutor_conversation_started: "Started a Tutor conversation",
  tutor_question_asked: "Asked the Tutor a question",
  quiz_started: "Started a quiz",
  quiz_question_answered: "Answered a quiz question",
  quiz_completed: "Completed a quiz",
  mastery_updated: "Mastery updated",
  recommendation_generated: "Recommendation generated",
};

// Derived from EVENT_LABELS' own keys rather than a second hardcoded list,
// so the Activity filter dropdown can't drift out of sync with the labels
// actually shown in the timeline.
export const ALL_EVENT_TYPES = Object.keys(EVENT_LABELS);
