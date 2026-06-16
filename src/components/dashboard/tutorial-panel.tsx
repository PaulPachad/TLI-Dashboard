"use client";

import { useState } from "react";

type TutorialStepId =
  | "start"
  | "interviews"
  | "social"
  | "relationships"
  | "opportunities"
  | "proof";

interface TutorialStep {
  id: TutorialStepId;
  label: string;
  title: string;
  summary: string;
  benefits: string[];
  actions: string[];
}

const FEATURE_GROUPS = [
  {
    title: "Interview Leverage",
    description: "Turn each published interview into follow-up actions clients can actually use.",
    features: [
      "Import and sync Authority Magazine interviews from Google Sheets",
      "Separate live interviews from upcoming or unpublished interviews",
      "Search by guest, topic, company, or PR contact",
      "Open the published article, BuzzFeed link, interview doc, images, and videos",
      "Track status from new to emailed, shared, Zoom requested, and fully leveraged",
    ],
  },
  {
    title: "Client Outreach",
    description: "Make it easy to notify guests and keep the relationship warm.",
    features: [
      "Add or update interviewee and publicist contact details",
      "Send the live-link email to the interviewee or PR contact",
      "CC the publicist automatically when both contacts are available",
      "Request a follow-up Zoom interview",
      "Use the client signature, reply-to email, and scheduling link in outreach",
    ],
  },
  {
    title: "Social Media",
    description: "Help clients promote their media feature quickly and consistently.",
    features: [
      "Generate multiple LinkedIn post variations",
      "Copy post text and open LinkedIn sharing",
      "Save the published LinkedIn post URL",
      "Download a branded social image for LinkedIn or Instagram",
      "Track whether the post and image were generated or shared",
    ],
  },
  {
    title: "VIP Signals",
    description: "Identify especially impressive interviewees and highlight why they matter.",
    features: [
      "Research VIP signals with Google search",
      "Flag major companies, large audiences, public authority, and senior leaders",
      "Score each person as Notable, High-Value, or Elite",
      "Show the reason for each flag in the details panel",
      "Sort standout people higher inside the normal workflow",
    ],
  },
  {
    title: "Topics and Questions",
    description: "Keep pitch ideas, source responses, and interview materials organized.",
    features: [
      "View thought-leadership topic ideas",
      "Filter by pitch forms, responses, and interview templates",
      "Open topic details in a side panel",
      "Find suggested interview questions",
      "Keep source requests and response notes connected to each topic",
    ],
  },
  {
    title: "Events and Press",
    description: "Spot relevant events and turn them into press opportunities.",
    features: [
      "Browse upcoming events by date, name, or city",
      "See event location, status, and contact information",
      "Extract event contact emails",
      "Send event outreach for press opportunities or press-pass requests",
      "Track event outreach from inside the dashboard",
    ],
  },
];

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "start",
    label: "Overview",
    title: "Start With the Highest-Value Interviews",
    summary:
      "The dashboard helps clients move from published interview to measurable leverage: outreach, social sharing, relationship building, VIP discovery, and event opportunities.",
    benefits: [
      "Every interview card shows what has already been done and what still needs attention.",
      "VIP research can highlight especially impressive interviewees.",
      "The workflow keeps clients from forgetting easy wins after an interview goes live.",
    ],
    actions: [
      "Sync the sheet.",
      "Scan VIP Signals and Needs Action.",
      "Open Details when a card needs context.",
    ],
  },
  {
    id: "interviews",
    label: "Live Links",
    title: "Notify the Interviewee and PR Contact",
    summary:
      "Once an article is live, the client can send a polished live-link email and keep a record of the outreach.",
    benefits: [
      "The email uses the article link and client details automatically.",
      "The system can send to the interviewee or publicist, and CC the second contact when available.",
      "The action timeline shows what was sent and when.",
    ],
    actions: [
      "Check that the card has an email contact.",
      "Use Send Live Link Email.",
      "Review the message and send.",
    ],
  },
  {
    id: "social",
    label: "Social",
    title: "Turn the Feature Into Social Proof",
    summary:
      "The client can generate LinkedIn copy, open LinkedIn sharing, download a branded image, and save the shared post URL.",
    benefits: [
      "Multiple LinkedIn variations give the client options.",
      "A branded social image makes the article easier to promote.",
      "Saved sharing history shows which interviews have been leveraged.",
    ],
    actions: [
      "Generate LinkedIn copy.",
      "Download the social image.",
      "Paste the final post URL and mark the interview shared.",
    ],
  },
  {
    id: "relationships",
    label: "Follow-Up",
    title: "Create a Second Conversation",
    summary:
      "The Zoom request turns a published article into a reason to reconnect and deepen the relationship.",
    benefits: [
      "The follow-up message can include the client scheduling link.",
      "The dashboard tracks whether the Zoom invitation was sent.",
      "This creates a natural next step after the public feature.",
    ],
    actions: [
      "Confirm contact information.",
      "Use Request Zoom Interview.",
      "Send the edited invitation.",
    ],
  },
  {
    id: "opportunities",
    label: "PR",
    title: "Find Events and Ask for Press Access",
    summary:
      "The Events tab helps clients identify event opportunities, find contact emails, and send outreach for press access or coverage.",
    benefits: [
      "Events can be grouped by city or sorted by date.",
      "Contact emails are extracted from event notes.",
      "The outreach template helps clients ask for press opportunities quickly.",
    ],
    actions: [
      "Open Events.",
      "Choose a relevant event.",
      "Use Email Contact for press-pass or coverage outreach.",
    ],
  },
  {
    id: "proof",
    label: "Materials",
    title: "Use Topics, Responses, and Questions",
    summary:
      "The Topics tab gives clients a central place to review pitches, source responses, and interview-question materials.",
    benefits: [
      "Topic filters reveal pitch forms, responses, and templates.",
      "The detail panel keeps long notes readable.",
      "Interview questions are easy to find when preparing the next feature.",
    ],
    actions: [
      "Open Topics.",
      "Filter by the material type needed.",
      "Open a topic to review details and questions.",
    ],
  },
];

export function TutorialPanel() {
  const [activeStep, setActiveStep] = useState<TutorialStepId>("start");
  const step = TUTORIAL_STEPS.find((item) => item.id === activeStep) ?? TUTORIAL_STEPS[0];

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
              Client Benefits Tutorial
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">
              Everything This Dashboard Helps You Do
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              A practical walkthrough of the ways clients can use every interview,
              topic, event, and contact to create more visibility and stronger follow-up.
            </p>
          </div>

          <div className="grid min-w-full grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-center sm:min-w-[360px]">
            <MiniMetric value="6" label="Workflow areas" />
            <MiniMetric value="30+" label="Client benefits" />
            <MiniMetric value="1" label="Action timeline" />
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="space-y-1">
            {TUTORIAL_STEPS.map((item, index) => {
              const isActive = item.id === activeStep;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveStep(item.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold ${
                    isActive
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row">
            <div className="flex-1">
              <h3 className="text-xl font-bold text-slate-900">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{step.summary}</p>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Benefits
                  </h4>
                  <ul className="mt-3 space-y-2">
                    {step.benefits.map((benefit) => (
                      <CheckItem key={benefit}>{benefit}</CheckItem>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Typical Flow
                  </h4>
                  <ol className="mt-3 space-y-2">
                    {step.actions.map((action, index) => (
                      <li key={action} className="flex gap-3 text-sm text-slate-700">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                          {index + 1}
                        </span>
                        <span className="pt-0.5">{action}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-900 lg:w-64">
              <p className="font-semibold">Best client habit</p>
              <p className="mt-2 leading-6">
                Check the dashboard after every sync, then work the cards with
                VIP Signals and Needs Action first.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Complete Feature List
            </h3>
            <p className="text-sm text-slate-500">
              A quick reference for every client-facing benefit currently in the dashboard.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {FEATURE_GROUPS.map((group) => (
            <article
              key={group.title}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <h4 className="font-semibold text-slate-900">{group.title}</h4>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                {group.description}
              </p>
              <ul className="mt-4 space-y-2">
                {group.features.map((feature) => (
                  <CheckItem key={feature}>{feature}</CheckItem>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function MiniMetric({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-xl font-bold text-slate-900">{value}</p>
      <p className="mt-0.5 text-[11px] font-medium text-slate-500">{label}</p>
    </div>
  );
}

function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2 text-sm leading-5 text-slate-700">
      <svg
        className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      <span>{children}</span>
    </li>
  );
}
