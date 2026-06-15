export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.3),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.2),transparent_42%)]" />
      <div className="absolute left-[-6rem] top-[-5rem] h-64 w-64 rounded-full border border-white/10" />
      <div className="absolute bottom-[-8rem] right-[-4rem] h-80 w-80 rounded-full border border-white/10" />
      <div className="relative z-10 w-full">{children}</div>
    </div>
  );
}
