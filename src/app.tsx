import { useEffect, useState } from "react";
import { FileLoader } from "./components/Overview/FileLoader";
import { checkBrowserSupport } from "./browserSupport";
import "./app.css";

export function App() {
  // null while checking; the list of missing features once known (016 FR-008).
  const [missing, setMissing] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void checkBrowserSupport().then((result) => {
      if (!cancelled) setMissing(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <main>
        <h1>NauticalBeg</h1>
        <p>EU5 save analysis — load a save to get started.</p>
        {missing !== null && missing.length > 0 ? (
          <div className="app-unsupported" role="alert">
            <h2 className="app-unsupported__title">This browser window can't run NauticalBeg</h2>
            <p>Missing: {missing.join(", ")}.</p>
            <p>Try a normal (non-private) window in an up-to-date Chrome, Firefox or Safari.</p>
          </div>
        ) : missing !== null ? (
          <FileLoader />
        ) : null}
      </main>
      {/* 016 FR-007 (version for bug reports) and FR-016 (fan-tool notice). */}
      <footer className="app-footer">
        <span>Unofficial fan tool — not affiliated with Paradox Interactive.</span>
        <span className="app-footer__version">v{__APP_VERSION__}</span>
      </footer>
    </>
  );
}
