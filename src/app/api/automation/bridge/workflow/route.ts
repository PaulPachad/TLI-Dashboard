import { NextResponse } from "next/server";
import {
  claimDailyWorkflowRun,
  claimDelivery,
  completeDeliveryCleanup,
  enqueueDeliveryCandidates,
  getMailboxForBridgeToken,
  recordDeliveryOutcome,
} from "@/lib/automation/service";

export async function POST(request: Request) {
  try {
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ error: "Bridge token required." }, { status: 401 });
    }

    const mailbox = await getMailboxForBridgeToken(token);
    if (!mailbox) {
      return NextResponse.json({ error: "Invalid bridge token." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "").trim();

    switch (action) {
      case "claim_run": {
        const workflowKey = String(body.workflowKey || "").trim();
        const localDate = String(body.localDate || "").trim();
        const leaseOwner = String(body.leaseOwner || "generic_worker").trim();

        if (!workflowKey || !localDate) {
          return NextResponse.json(
            { error: "workflowKey and localDate required" },
            { status: 400 }
          );
        }

        const result = await claimDailyWorkflowRun(
          mailbox.id,
          workflowKey,
          localDate,
          leaseOwner
        );
        return NextResponse.json(result);
      }

      case "enqueue_candidates": {
        const workflowId = String(body.workflowId || "").trim();
        const runId = String(body.runId || "").trim();
        const candidates = Array.isArray(body.candidates) ? body.candidates : [];

        if (!workflowId || !runId) {
          return NextResponse.json(
            { error: "workflowId and runId required" },
            { status: 400 }
          );
        }

        const result = await enqueueDeliveryCandidates(workflowId, runId, candidates);
        return NextResponse.json(result);
      }

      case "claim_delivery": {
        const workflowId = String(body.workflowId || "").trim();
        const deliveryId = String(body.deliveryId || "").trim();
        const leaseOwner = String(body.leaseOwner || "generic_worker").trim();

        if (!workflowId || !deliveryId) {
          return NextResponse.json(
            { error: "workflowId and deliveryId required" },
            { status: 400 }
          );
        }

        const result = await claimDelivery(workflowId, deliveryId, leaseOwner);
        return NextResponse.json(result);
      }

      case "record_outcome": {
        const deliveryId = String(body.deliveryId || "").trim();
        const state = String(body.state || "").trim();
        const gmailSentId = body.gmailSentId ? String(body.gmailSentId) : null;
        const errorMessage = body.errorMessage ? String(body.errorMessage) : null;

        if (!deliveryId || !state) {
          return NextResponse.json(
            { error: "deliveryId and state required" },
            { status: 400 }
          );
        }

        const result = await recordDeliveryOutcome(deliveryId, {
          state,
          gmailSentId,
          errorMessage,
        });
        return NextResponse.json(result);
      }

      case "complete_cleanup": {
        const deliveryId = String(body.deliveryId || "").trim();
        if (!deliveryId) {
          return NextResponse.json({ error: "deliveryId required" }, { status: 400 });
        }

        const result = await completeDeliveryCleanup(deliveryId);
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json({ error: `Unknown action '${action}'` }, { status: 400 });
    }
  } catch (error) {
    console.error("Bridge workflow operation failed.", error);
    return NextResponse.json(
      { error: "Workflow bridge operation failed." },
      { status: 500 }
    );
  }
}

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
