import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/auth-helpers";
import { runAutomationTest } from "@/lib/automation/test-lab";

export async function GET() {
  try {
    await requireApiAdmin();
    return NextResponse.json({
      sample: {
        subject: "Pitch: 5 Things You Need To Know To Successfully Run A Live Virtual Event",
        sender: "Publicist <publicist@example.com>",
        body:
          "Dear Authority Magazine Editors\n\nWhat is the name of the interview topic: 5 Things You Need To Know To Successfully Run A Live Virtual Event\nWhat is the best email to follow up with you: publicist@example.com",
      },
    });
  } catch (error: unknown) {
    return handleApiError(error, "Failed to load automation test sample.");
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireApiAdmin();
    const body = await request.json();
    const result = await runAutomationTest({
      subject: body.subject,
      sender: body.sender,
      body: body.body,
    });
    return NextResponse.json({ result });
  } catch (error: unknown) {
    return handleApiError(error, "Failed to run automation test.");
  }
}

function handleApiError(error: unknown, fallback: string) {
  const err = error as { status?: number; message?: string };
  if (err.status) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(fallback, error);
  return NextResponse.json({ error: err.message || fallback }, { status: 500 });
}
