"use client";

// ==============================================================================
// Action Modal — Component for handling card actions (emails, social posts, form updates)
// ==============================================================================

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  buildBrowserSocialImageSources,
  extractArticleTitleFromUrl,
} from "@/lib/images/interview-image";

interface ActionModalProps {
  interviewId: string;
  actionType: "add_contact" | "send_live_email" | "generate_linkedin" | "mark_shared" | "send_zoom_invite" | "generate_social_image";
  onClose: () => void;
  onSuccess: (message?: string) => void;
}

interface SocialImageInterview {
  id: string;
  intervieweeName: string;
  intervieweeCompany?: string | null;
  intervieweeTitle?: string | null;
  topic?: string | null;
  articleUrl: string;
  image1Url?: string | null;
  image2Url?: string | null;
  articleTitle?: string | null;
}

export function ActionModal({ interviewId, actionType, onClose, onSuccess }: ActionModalProps) {
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [socialImagePreviewUrl, setSocialImagePreviewUrl] = useState<string | null>(null);
  const [socialImageRendering, setSocialImageRendering] = useState(false);
  const [socialInterview, setSocialInterview] = useState<SocialImageInterview | null>(null);
  
  // State for forms/previews
  const [intervieweeName, setIntervieweeName] = useState("");
  const [contactForm, setContactForm] = useState({
    intervieweeEmail: "",
    publicistName: "",
    publicistEmail: "",
  });

  const [emailForm, setEmailForm] = useState({
    to: "",
    cc: "",
    subject: "",
    body: "",
  });

  const [linkedinText, setLinkedinText] = useState("");
  const [linkedinVariations, setLinkedinVariations] = useState<string[]>([]);
  const [linkedinPostUrl, setLinkedinPostUrl] = useState("");
  const [articleUrl, setArticleUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [schedulingConfigured, setSchedulingConfigured] = useState(false);

  // Fetch defaults
  useEffect(() => {
    async function loadDefaults() {
      try {
        setFetching(true);
        setError(null);
        setLoadError(null);
        const res = await fetch(`/api/interviews/${interviewId}/action`);
        if (!res.ok) {
          throw new Error("Failed to load action details.");
        }
        const data = await res.json();
        setDemoMode(Boolean(data.demoMode));
        setEmailConfigured(Boolean(data.emailConfigured));
        setSchedulingConfigured(Boolean(data.schedulingConfigured));
        
        setIntervieweeName(data.interview.intervieweeName);
        setArticleUrl(data.interview.articleUrl || "");
        setSocialInterview({
          id: data.interview.id,
          intervieweeName: data.interview.intervieweeName,
          intervieweeCompany: data.interview.intervieweeCompany || null,
          intervieweeTitle: data.interview.intervieweeTitle || null,
          topic: data.interview.topic || null,
          articleUrl: data.interview.articleUrl || "",
          image1Url: data.interview.image1Url || null,
          image2Url: data.interview.image2Url || null,
          articleTitle: data.articleTitle || null,
        });
        
        // Populate contact form defaults
        setContactForm({
          intervieweeEmail: data.interview.intervieweeEmail || "",
          publicistName: data.interview.publicistName || "",
          publicistEmail: data.interview.publicistEmail || "",
        });

        // Populate email templates
        if (actionType === "send_live_email") {
          setEmailForm({
            to: data.liveEmail.to,
            cc: data.liveEmail.cc || "",
            subject: data.liveEmail.subject,
            body: data.liveEmail.body,
          });
        } else if (actionType === "send_zoom_invite") {
          setEmailForm({
            to: data.zoomInvite.to,
            cc: data.zoomInvite.cc || "",
            subject: data.zoomInvite.subject,
            body: data.zoomInvite.body,
          });
        } else if (actionType === "generate_linkedin") {
          setLinkedinText(data.linkedin.postText);
          setLinkedinVariations(data.linkedin.variations || [data.linkedin.postText]);
        }
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : "Failed to load defaults."
        );
      } finally {
        setFetching(false);
      }
    }

    loadDefaults();
  }, [interviewId, actionType]);

  useEffect(() => {
    if (actionType !== "generate_social_image" || !socialInterview) return;

    let cancelled = false;

    Promise.resolve()
      .then(() => {
        if (cancelled) return null;
        setSocialImageRendering(true);
        setError(null);
        return generateBrowserSocialImage(socialInterview);
      })
      .then((blob) => {
        if (!blob) return;
        if (cancelled) return;
        const nextUrl = URL.createObjectURL(blob);
        setSocialImagePreviewUrl((previousUrl) => {
          if (previousUrl) URL.revokeObjectURL(previousUrl);
          return nextUrl;
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not render the social image preview."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setSocialImageRendering(false);
      });

    return () => {
      cancelled = true;
    };
  }, [actionType, socialInterview]);

  useEffect(() => {
    return () => {
      if (socialImagePreviewUrl) URL.revokeObjectURL(socialImagePreviewUrl);
    };
  }, [socialImagePreviewUrl]);

  useEffect(() => {
    // The modal is portal-mounted after hydration so it can safely access document.body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const previouslyFocused = document.activeElement as HTMLElement | null;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus({ preventScroll: true });
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.documentElement.style.overflow = previousOverflow;
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, [onClose]);

  // Handle Form Submit
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);

      let payload: {
        intervieweeEmail?: string;
        publicistName?: string;
        publicistEmail?: string;
        subject?: string;
        body?: string;
        linkedinPostUrl?: string;
      } = {};
      if (actionType === "add_contact") {
        payload = contactForm;
      } else if (actionType === "send_live_email" || actionType === "send_zoom_invite") {
        payload = {
          subject: emailForm.subject,
          body: emailForm.body,
        };
      } else if (actionType === "mark_shared") {
        payload = { linkedinPostUrl };
      }

      const res = await fetch(`/api/interviews/${interviewId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType,
          data: payload,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Action failed to execute.");
      }

      onSuccess(data.note);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setLoading(false);
    }
  }

  // Handle Clipboard Copy
  async function handleCopy() {
    try {
      setLoading(true);
      setError(null);
      await navigator.clipboard.writeText(linkedinText);

      const generatedResponse = await fetch(`/api/interviews/${interviewId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "generate_linkedin",
          data: { postText: linkedinText },
        }),
      });
      if (!generatedResponse.ok) {
        const data = await generatedResponse.json();
        throw new Error(data.error || "Could not save the LinkedIn post.");
      }

      const copyResponse = await fetch(`/api/interviews/${interviewId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionType: "copy_linkedin" }),
      });
      if (!copyResponse.ok) {
        throw new Error("The post was copied, but tracking could not be saved.");
      }

      setCopied(true);
      onSuccess("LinkedIn post copied and added to the action timeline.");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to copy the post.");
    } finally {
      setLoading(false);
    }
  }

  // Handle Clipboard Copy and Share on LinkedIn Offsite share
  async function handleCopyAndShare() {
    try {
      setLoading(true);
      setError(null);
      await navigator.clipboard.writeText(linkedinText);

      const generatedResponse = await fetch(`/api/interviews/${interviewId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "generate_linkedin",
          data: { postText: linkedinText },
        }),
      });
      if (!generatedResponse.ok) {
        const data = await generatedResponse.json();
        throw new Error(data.error || "Could not save the LinkedIn post.");
      }

      const copyResponse = await fetch(`/api/interviews/${interviewId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionType: "copy_linkedin" }),
      });
      if (!copyResponse.ok) {
        throw new Error("The post was copied, but tracking could not be saved.");
      }

      setCopied(true);
      onSuccess("LinkedIn post copied! Opening sharing page...");

      const shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(articleUrl)}`;
      window.open(shareUrl, "_blank", "noopener,noreferrer");

      setTimeout(() => {
        setCopied(false);
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to copy and share.");
    } finally {
      setLoading(false);
    }
  }

  // Handle Image Download
  async function handleDownloadImage() {
    try {
      setLoading(true);
      setError(null);

      if (!socialInterview) {
        throw new Error("The image details are still loading.");
      }

      const blob = await generateBrowserSocialImage(socialInterview);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `AuthorityMag_Social_${interviewId}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      const actionRes = await fetch(`/api/interviews/${interviewId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionType: "generate_social_image" }),
      });
      
      if (!actionRes.ok) {
        throw new Error("The image was downloaded, but tracking could not be saved.");
      }
      
      onSuccess("Social image downloaded successfully.");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download image.");
    } finally {
      setLoading(false);
    }
  }

  // Render modal content by type
  function renderContent() {
    if (fetching) {
      return (
        <div className="flex h-48 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
            <p className="text-sm text-slate-500">Loading action details…</p>
          </div>
        </div>
      );
    }

    if (loadError) {
      return (
        <div className="p-6 space-y-4">
          <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-lg text-sm">
            {loadError}
          </div>
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      );
    }

    switch (actionType) {
      case "add_contact":
        return (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <h3 className="text-lg font-semibold text-slate-900 font-sans">Add Contact Info for {intervieweeName}</h3>
            <p className="text-xs text-slate-500 font-sans">Provide interviewee and PR contact details to enable direct email campaigns.</p>
            <ActionError message={error} />
            
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1 font-sans">Interviewee Email</label>
                <input
                  type="email"
                  required
                  placeholder="interviewee@example.com"
                  value={contactForm.intervieweeEmail}
                  onChange={(e) => setContactForm({ ...contactForm, intervieweeEmail: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none font-sans"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1 font-sans">Publicist Name (Optional)</label>
                <input
                  type="text"
                  placeholder="PR Contact Name"
                  value={contactForm.publicistName}
                  onChange={(e) => setContactForm({ ...contactForm, publicistName: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none font-sans"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1 font-sans">Publicist Email (Optional)</label>
                <input
                  type="email"
                  placeholder="pr@company.com"
                  value={contactForm.publicistEmail}
                  onChange={(e) => setContactForm({ ...contactForm, publicistEmail: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none font-sans"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50 transition-colors font-sans"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 font-sans"
              >
                {loading ? "Saving..." : "Save Info"}
              </button>
            </div>
          </form>
        );

      case "send_live_email":
      case "send_zoom_invite":
        const isLive = actionType === "send_live_email";
        return (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <h3 className="text-lg font-semibold text-slate-900 font-sans">
              {isLive ? "Send Live Link Email" : "Send Zoom Follow-up Invitation"}
            </h3>
            <p className="text-xs text-slate-500 font-sans">
              {isLive 
                ? "Preview and edit the email notifying the guest their interview is published."
                : "Invite the guest to a short follow-up video session to expand their thought leadership."}
            </p>
            <ActionError message={error} />

            {demoMode && !emailConfigured && (
              <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                Demo mode is on. This action will be tracked, but no email will
                leave the app.
              </div>
            )}
            {!demoMode && !emailConfigured && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Email delivery is not configured. Ask an administrator to add
                the Resend API key before sending.
              </div>
            )}
            {!isLive && !schedulingConfigured && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                No scheduling link is saved. This email will ask the guest to
                reply with available times. You can add a link in{" "}
                <a
                  href="/dashboard/settings"
                  className="font-semibold underline underline-offset-2"
                >
                  Settings
                </a>.
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1 font-sans">To</label>
                <input
                  type="text"
                  disabled
                  value={emailForm.to || "(No email address set — Please update contact info)"}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 font-sans"
                />
              </div>
              {emailForm.cc && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1 font-sans">
                    CC
                  </label>
                  <input
                    type="text"
                    disabled
                    value={emailForm.cc}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 font-sans"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1 font-sans">Subject</label>
                <input
                  type="text"
                  required
                  value={emailForm.subject}
                  onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none font-sans"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1 font-sans">Body Preview</label>
                <textarea
                  required
                  rows={8}
                  value={emailForm.body}
                  onChange={(e) => setEmailForm({ ...emailForm, body: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono text-xs focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 font-sans">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  loading ||
                  !emailForm.to ||
                  (!demoMode && !emailConfigured)
                }
                className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {loading ? "Sending..." : isLive ? "Send Email" : "Send Invitation"}
              </button>
            </div>
          </form>
        );

      case "generate_linkedin":
        return (
          <div className="p-6 space-y-4">
            <h3 className="text-lg font-semibold text-slate-900 font-sans">Generate LinkedIn Post</h3>
            <p className="text-xs text-slate-500 font-sans">Copy this customized text to share the published interview on LinkedIn.</p>
            <ActionError message={error} />

            {linkedinVariations.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {linkedinVariations.map((variation, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setLinkedinText(variation)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                      linkedinText === variation
                        ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 text-slate-600 hover:border-indigo-300"
                    }`}
                  >
                    Variation {index + 1}
                  </button>
                ))}
              </div>
            )}

            <textarea
              aria-label="LinkedIn post"
              rows={10}
              value={linkedinText}
              onChange={(event) => setLinkedinText(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700 focus:border-indigo-500 focus:bg-white focus:outline-none"
            />

            <div className="flex flex-col gap-3 border-t border-slate-100 pt-3 font-sans sm:flex-row sm:items-center sm:justify-between">
              <a
                href="https://www.linkedin.com/feed/"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  fetch(`/api/interviews/${interviewId}/action`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      actionType: "generate_linkedin",
                      data: { postText: linkedinText },
                    }),
                  }).then(() => onSuccess());
                }}
                className="text-xs text-slate-500 hover:text-indigo-600 hover:underline flex items-center gap-1.5 font-medium transition-colors"
              >
                Or open main LinkedIn feed →
              </a>

              <div className="flex flex-col-reverse gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={loading || !linkedinText.trim()}
                  className="px-4 py-2 border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-sm font-semibold rounded-lg transition-colors"
                >
                  Copy Only
                </button>
                <button
                  type="button"
                  onClick={handleCopyAndShare}
                  disabled={loading || !linkedinText.trim()}
                  className={`px-5 py-2 rounded-lg text-sm font-semibold text-white transition-all shadow-sm flex items-center justify-center gap-1.5 ${
                    copied
                      ? "bg-emerald-600 hover:bg-emerald-700" 
                      : "bg-sky-600 hover:bg-sky-700"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <svg className="h-4 w-4 fill-current shrink-0" viewBox="0 0 24 24">
                    <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
                  </svg>
                  {copied ? "✓ Copied!" : "Copy & Go to LinkedIn"}
                </button>
              </div>
            </div>
          </div>
        );

      case "generate_social_image":
        return (
          <div className="p-6 space-y-4">
            <h3 className="text-lg font-semibold text-slate-900 font-sans">Get Social Image</h3>
            <p className="text-xs text-slate-500 font-sans">
              Download this beautifully branded image to share on Instagram or LinkedIn along with your post.
            </p>
            <ActionError message={error} />
            
            <div className="relative w-full aspect-square bg-slate-100 rounded-lg overflow-hidden border border-slate-200 shadow-sm flex items-center justify-center">
              {socialImagePreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={socialImagePreviewUrl}
                  alt="Social Media Preview"
                  className="object-contain w-full h-full"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-sm text-slate-500">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-pink-600 border-t-transparent" />
                  Rendering preview...
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 font-sans">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDownloadImage}
                disabled={loading || socialImageRendering || !socialImagePreviewUrl}
                className="px-5 py-2 bg-pink-600 text-white rounded-lg text-sm font-semibold hover:bg-pink-700 transition-colors disabled:opacity-50"
              >
                {loading ? "Downloading..." : "Download Image"}
              </button>
            </div>
          </div>
        );

      case "mark_shared":
        return (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <h3 className="text-lg font-semibold text-slate-900 font-sans">Mark as Shared</h3>
            <p className="text-sm text-slate-600 font-sans">
              Confirm that you have shared this interview post on social media to proceed to the next step.
            </p>
            <ActionError message={error} />

            <div>
              <label
                htmlFor="linkedin-post-url"
                className="mb-1 block text-xs font-semibold text-slate-500"
              >
                LinkedIn post URL <span className="font-normal">(optional)</span>
              </label>
              <input
                id="linkedin-post-url"
                type="url"
                inputMode="url"
                placeholder="https://www.linkedin.com/posts/..."
                value={linkedinPostUrl}
                onChange={(event) => setLinkedinPostUrl(event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-slate-400">
                Saving the post link makes the campaign history easier to verify.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 font-sans">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {loading ? "Saving..." : "Confirm Shared"}
              </button>
            </div>
          </form>
        );

      default:
        return null;
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-x-hidden overflow-y-auto outline-none focus:outline-none">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />
      
      {/* Content wrapper */}
      <div className="relative w-full max-w-xl mx-auto my-6 px-4 z-50">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Interview action"
          ref={dialogRef}
          className="relative flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl outline-none animate-scale-up"
        >
          {/* Close button top right */}
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close action"
            className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          
          {renderContent()}
        </div>
      </div>
    </div>,
    document.body
  );
}

function ActionError({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
    >
      {message}
    </div>
  );
}

async function generateBrowserSocialImage(
  interview: SocialImageInterview
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot render the social image.");

  drawBaseBackground(ctx, canvas.width, canvas.height);

  const imageSources = buildBrowserSocialImageSources(interview);
  const featureImage = await firstLoadedImage(imageSources);
  if (featureImage) {
    drawCoverImage(ctx, featureImage, 0, 0, canvas.width, canvas.height);
  } else {
    drawInitialFallback(ctx, interview.intervieweeName, canvas.width, canvas.height);
  }

  drawImageOverlays(ctx, canvas.width, canvas.height);

  const logo = await loadCanvasImage("/authority-logo-mark-white.png").catch(
    () => null
  );
  if (logo) {
    ctx.drawImage(logo, 64, 64, 86, 86);
  }

  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.font = "800 27px Arial, sans-serif";
  ctx.letterSpacing = "3px";
  ctx.fillText("AUTHORITY MAGAZINE", logo ? 174 : 64, 102);
  ctx.letterSpacing = "0px";
  ctx.fillStyle = "rgba(255,255,255,0.76)";
  ctx.font = "22px Arial, sans-serif";
  ctx.fillText("Featured Interview", logo ? 174 : 64, 132);

  const headline =
    interview.articleTitle ||
    extractArticleTitleFromUrl(interview.articleUrl) ||
    cleanTopicTitle(interview.topic) ||
    `An Authority Magazine interview with ${interview.intervieweeName}`;

  // Determine font size based on lines wrapped
  let fontSize = 70;
  let lineSpacing = 76;
  let fontWeight = "850";

  ctx.fillStyle = "white";
  ctx.font = `${fontWeight} ${fontSize}px Arial, sans-serif`;
  let headlineLines = wrapCanvasText(ctx, headline, 920, 5);

  if (headlineLines.length > 3) {
    fontSize = 48;
    lineSpacing = 54;
    fontWeight = "800";
    ctx.font = `${fontWeight} ${fontSize}px Arial, sans-serif`;
    headlineLines = wrapCanvasText(ctx, headline, 920, 5);
  } else if (headlineLines.length > 2) {
    fontSize = 56;
    lineSpacing = 62;
    fontWeight = "800";
    ctx.font = `${fontWeight} ${fontSize}px Arial, sans-serif`;
    headlineLines = wrapCanvasText(ctx, headline, 920, 5);
  }

  // Draw bottom elements bottom-up to prevent overlapping
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "700 24px Arial, sans-serif";
  ctx.fillText("Read the full interview on Authority Magazine", 64, 1018);

  const roleLine = [interview.intervieweeTitle, interview.intervieweeCompany]
    .filter(Boolean)
    .join(", ");

  let nextY = 952;

  if (roleLine) {
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.font = "26px Arial, sans-serif";
    ctx.fillText(roleLine, 64, nextY);
    nextY -= 40;
  }

  ctx.fillStyle = "white";
  ctx.font = "800 38px Arial, sans-serif";
  ctx.fillText(interview.intervieweeName, 64, nextY);
  nextY -= 50;

  ctx.fillStyle = "#e40062";
  drawRoundRect(ctx, 64, nextY - 6, 150, 6, 3);
  ctx.fill();
  nextY -= 35;

  ctx.fillStyle = "white";
  ctx.font = `${fontWeight} ${fontSize}px Arial, sans-serif`;
  for (let i = headlineLines.length - 1; i >= 0; i--) {
    ctx.fillText(headlineLines[i], 64, nextY);
    nextY -= lineSpacing;
  }

  const badgeTop = (nextY + lineSpacing) - 103;
  drawRoundRect(ctx, 64, badgeTop, 145, 48, 24);
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.86)";
  ctx.font = "700 22px Arial, sans-serif";
  ctx.letterSpacing = "1.8px";
  ctx.fillText("FEATURED", 86, badgeTop + 31);
  ctx.letterSpacing = "0px";

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not render the social image."));
    }, "image/png");
  });
}

async function firstLoadedImage(sources: string[]): Promise<HTMLImageElement | null> {
  for (const source of sources) {
    try {
      return await loadCanvasImage(source);
    } catch {
      // Try the next sheet image source.
    }
  }
  return null;
}

function loadCanvasImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${src}`));
    image.src = src;
  });
}

function drawBaseBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#171126");
  gradient.addColorStop(0.45, "#202657");
  gradient.addColorStop(1, "#5b1634");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) * 0.28;
  ctx.drawImage(
    image,
    sourceX,
    Math.max(0, sourceY),
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height
  );
}

function drawInitialFallback(
  ctx: CanvasRenderingContext2D,
  name: string,
  width: number,
  height: number
) {
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.font = "800 360px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name.charAt(0).toUpperCase(), width / 2, height / 2);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

function drawImageOverlays(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
) {
  let gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "rgba(8,10,24,0.28)");
  gradient.addColorStop(0.38, "rgba(8,10,24,0.44)");
  gradient.addColorStop(1, "rgba(8,10,24,0.88)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, "rgba(91,22,52,0.32)");
  gradient.addColorStop(0.44, "rgba(20,17,38,0)");
  gradient.addColorStop(1, "rgba(15,23,42,0.32)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(nextLine).width <= maxWidth || !currentLine) {
      currentLine = nextLine;
      continue;
    }

    lines.push(currentLine);
    currentLine = word;
    if (lines.length === maxLines - 1) break;
  }

  if (currentLine && lines.length < maxLines) lines.push(currentLine);
  return lines;
}

function cleanTopicTitle(value?: string | null): string | null {
  const topic = value?.trim();
  if (!topic || /\([^)]*name[^)]*\)|\bname\b|rising star/i.test(topic)) {
    return null;
  }
  return topic;
}

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}
