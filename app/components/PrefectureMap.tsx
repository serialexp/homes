import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useNavigate } from "@remix-run/react";

interface PrefectureMapProps {
  /** Link target for a prefecture code ("01".."47"), or undefined when it has no page to open. */
  hrefFor: (prefectureCode: string) => string | undefined;
  /** Item count per prefecture code ("01".."47"); missing codes count as 0. */
  counts: Record<string, number>;
}

const MAP_URL = "/japan-prefectures.svg";

/**
 * Japan prefecture map. The SVG is fetched at runtime (it is too large to ship in the JS bundle)
 * and injected as markup. Each prefecture is an element with `data-code` equal to its JIS code, which
 * matches the province ids used in the app. The SVG also holds an empty count label per prefecture
 * (positions set by src/scripts/generatePrefectureLabels.ts); this component only fills in the numbers.
 *
 * Map data: MLIT National Land Numerical Information N03 (CC BY 4.0), processed by
 * japan-map-assets (MIT). Notices are in /map-licenses/.
 */
export function PrefectureMap({ hrefFor, counts }: PrefectureMapProps) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [markup, setMarkup] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(MAP_URL, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error(`Map request failed with ${response.status}`);
        return response.text();
      })
      .then(setMarkup)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const labels = containerRef.current?.querySelectorAll<SVGTextElement>("text.pref-count[data-code]");
    if (!labels) return;
    for (const label of labels) {
      const code = label.getAttribute("data-code") ?? "";
      label.textContent = (counts[code] ?? 0).toLocaleString();
    }
  }, [markup, counts]);

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const element = (event.target as Element).closest("[data-code]");
    const code = element?.getAttribute("data-code");
    const href = code ? hrefFor(code) : undefined;
    if (href) navigate(href);
  }

  return (
    <div className="pref-map" ref={containerRef}>
      <style>{`
        .pref-map svg { width: 100%; height: auto; display: block; }
        .pref-map path[data-code] { cursor: pointer; transition: fill 120ms ease; }
        .pref-map path[data-code]:hover { fill: #5b8fb0; }
        .pref-map .pref-count {
          font-family: system-ui, sans-serif;
          font-weight: 600;
          fill: #1d2b28;
          stroke: #ffffff;
          stroke-width: 4px;
          stroke-linejoin: round;
          paint-order: stroke;
        }
      `}</style>
      {markup ? (
        <div onClick={handleClick} dangerouslySetInnerHTML={{ __html: markup }} />
      ) : (
        <div className="aspect-[1200/1200] w-full rounded bg-base-200">
          {failed && <p className="p-4 text-sm text-base-content/60">Map could not be loaded.</p>}
        </div>
      )}
      <p className="mt-2 text-xs text-base-content/50">
        Map: MLIT N03 (CC BY 4.0), processed by japan-map-assets (MIT).{" "}
        <a className="underline" href="/map-licenses/japan-map-data-LICENSE.md">Data notice</a>
        {" · "}
        <a className="underline" href="/map-licenses/japan-map-assets-MIT.txt">MIT licence</a>
      </p>
    </div>
  );
}
