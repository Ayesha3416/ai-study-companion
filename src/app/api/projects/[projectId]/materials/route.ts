import { NextResponse } from "next/server";
import { listMaterialsForProject } from "@/app/(dashboard)/projects/[projectId]/materials/actions";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  try {
    const materials = await listMaterialsForProject(projectId);
    return NextResponse.json({ materials });
  } catch {
    // listMaterialsForProject relies on RLS via the user-scoped Supabase
    // client, so a project the caller doesn't own simply returns an error
    // here rather than leaking data.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
