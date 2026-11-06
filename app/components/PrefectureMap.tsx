import { useEffect, useState, type MouseEvent } from "react";
import { useNavigate } from "@remix-run/react";

interface PrefectureMapProps {
  /** Link target for a prefecture code ("01".."47"), or undefined when it has no page to open. */
  hrefFor: (prefectureCode: string) => string | undefined;
}

const MAP_URL = "/japan-prefectures.svg";

/**
 * Japan prefecture map. The SVG is fetched at runtime (it is too large to ship in the JS bundle)
 * and injected as markup; each prefecture is an element with `data-code` equal to its JIS code,
 * which matches the province ids used in the app.
 *
 * Map data: MLIT National Land Numerical Information N03 (CC BY 4.0), processed by
 * japan-map-assets (MIT). Notices are in /map-licenses/.
 */
export function PrefectureMap({ hrefFor }: PrefectureMapProps) {
  const navigate = useNavigate();
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

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const element = (event.target as Element).closest("[data-code]");
    const code = element?.getAttribute("data-code");
    const href = code ? hrefFor(code) : undefined;
    if (href) navigate(href);
  }

  return (
    <div className="pref-map">
      <style>{`
        .pref-map svg { width: 100%; height: auto; display: block; }
        .pref-map [data-code] { cursor: pointer; transition: fill 120ms ease; }
        .pref-map [data-code]:hover { fill: #5b8fb0; }
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
