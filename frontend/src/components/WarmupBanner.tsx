import { useEffect, useState } from "react";
import { pingHealth } from "../api/client";

/**
 * Warms the free-tier backend on app load and shows a non-blocking banner if the first
 * request is slow (the Render free tier sleeps after ~15 min idle and takes 30-60s to
 * wake). The banner clears as soon as the backend responds, so the app never looks broken.
 */
export default function WarmupBanner() {
  const [waking, setWaking] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let done = false;
    const slow = setTimeout(() => {
      if (!done) setWaking(true);
    }, 3000);
    pingHealth()
      .catch(() => {})
      .finally(() => {
        done = true;
        clearTimeout(slow);
        setReady(true);
        setWaking(false);
      });
    return () => clearTimeout(slow);
  }, []);

  if (ready || !waking) return null;

  return (
    <div
      className="text-sm text-center py-2 px-4 border-b"
      style={{ background: "#3a2f12", color: "#f0c674", borderColor: "#5a4a1e" }}
    >
      Waking the server up - this can take up to a minute on the free tier...
    </div>
  );
}
