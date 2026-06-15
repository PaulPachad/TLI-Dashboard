import type { ReactNode } from "react";

interface EmailShellProps {
  eyebrow: string;
  heading: string;
  body: string;
  accent: string;
  children?: ReactNode;
}

export function EmailShell({
  eyebrow,
  heading,
  body,
  accent,
  children,
}: EmailShellProps) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          backgroundColor: "#f1f5f9",
          color: "#0f172a",
          fontFamily:
            "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <table
          role="presentation"
          width="100%"
          cellPadding="0"
          cellSpacing="0"
          style={{ padding: "32px 16px" }}
        >
          <tbody>
            <tr>
              <td align="center">
                <table
                  role="presentation"
                  width="100%"
                  cellPadding="0"
                  cellSpacing="0"
                  style={{
                    maxWidth: "620px",
                    overflow: "hidden",
                    border: "1px solid #e2e8f0",
                    borderRadius: "16px",
                    backgroundColor: "#ffffff",
                    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)",
                  }}
                >
                  <tbody>
                    <tr>
                      <td
                        style={{
                          height: "6px",
                          backgroundColor: accent,
                          fontSize: 0,
                        }}
                      >
                        &nbsp;
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: "36px 40px 12px" }}>
                        <p
                          style={{
                            margin: "0 0 10px",
                            color: accent,
                            fontSize: "12px",
                            fontWeight: 700,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                          }}
                        >
                          {eyebrow}
                        </p>
                        <h1
                          style={{
                            margin: 0,
                            color: "#0f172a",
                            fontSize: "26px",
                            lineHeight: 1.25,
                          }}
                        >
                          {heading}
                        </h1>
                      </td>
                    </tr>
                    <tr>
                      <td
                        style={{
                          padding: "16px 40px 36px",
                          color: "#334155",
                          fontSize: "16px",
                          lineHeight: 1.65,
                        }}
                      >
                        {body.split("\n").map((line, index) =>
                          /^https?:\/\/\S+$/.test(line.trim()) ? (
                            <p key={index} style={{ margin: "16px 0" }}>
                              <a
                                href={line.trim()}
                                style={{
                                  color: accent,
                                  fontWeight: 600,
                                  wordBreak: "break-all",
                                }}
                              >
                                {line.trim()}
                              </a>
                            </p>
                          ) : (
                            <p
                              key={index}
                              style={{
                                minHeight: line ? undefined : "8px",
                                margin: line ? "0 0 8px" : 0,
                                whiteSpace: "pre-wrap",
                              }}
                            >
                              {line || "\u00a0"}
                            </p>
                          )
                        )}
                        {children}
                      </td>
                    </tr>
                    <tr>
                      <td
                        style={{
                          borderTop: "1px solid #e2e8f0",
                          padding: "18px 40px",
                          color: "#94a3b8",
                          fontSize: "12px",
                        }}
                      >
                        Sent with TLI Leverage Dashboard
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}
