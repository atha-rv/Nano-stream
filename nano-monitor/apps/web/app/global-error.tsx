'use client';

// A root-layout failure cannot depend on its providers, navigation or styles.
// Keep the last recovery surface independent of app configuration and i18n.
export default function GlobalErrorPage({ retry }: { retry: () => void }) {
  return (
    <html lang="en">
      <head>
        <title>Page unavailable</title>
        <style>{`
          :root { --background:#f7f8fa; --foreground:#17202c; --muted-foreground:#586474; --primary:#145d55; --primary-foreground:#fff; --border:#798897; }
          @media(prefers-color-scheme:dark) { :root { --background:#121a21; --foreground:#edf2f7; --muted-foreground:#acb9c8; --primary:#94ded0; --primary-foreground:#122923; --border:#758798; } }
          * { box-sizing:border-box; }
          body { margin:0; background:var(--background); color:var(--foreground); font-family:system-ui,sans-serif; line-height:1.6; }
          main { min-height:100dvh; max-width:36rem; margin:auto; padding:3rem 20px; display:flex; flex-direction:column; justify-content:center; }
          h1 { font-size:1.75rem; line-height:1.25; margin:0; overflow-wrap:anywhere; }
          p { color:var(--muted-foreground); margin:1rem 0 1.5rem; }
          .actions { display:flex; flex-wrap:wrap; gap:12px; }
          button,a { display:inline-flex; align-items:center; justify-content:center; min-height:44px; max-width:100%; padding:10px 16px; border:1px solid var(--border); border-radius:8px; font:inherit; line-height:1.4; color:var(--foreground); background:transparent; text-decoration:none; cursor:pointer; touch-action:manipulation; }
          button { background:var(--primary); color:var(--primary-foreground); border-color:var(--primary); }
          :focus-visible { outline:2px solid var(--primary); outline-offset:4px; }
        `}</style>
      </head>
      <body>
        <main>
          <h1>We couldn’t open the app</h1>
          <p>Try again. If the problem continues, reload the workspace.</p>
          <div className="actions">
            <button onClick={retry} data-test="retry-app">
              Try again
            </button>
            <a href="/" data-test="reload-workspace">
              Reload workspace
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
