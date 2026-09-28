"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyPatch, type Operation, type RealityPatch, type World } from "../world/model";
import { compare, formatTime, getEvent, sampleEntity, sampleRoute, simulate } from "../engine/simulate";
import { applyAlternative, keepThisMoment, type Goal, type SearchResult } from "../engine/search";

const Diorama = dynamic(() => import("../scene/Diorama"), {
  ssr: false,
  loading: () => <div className="scene-loading">Building the neighborhood…</div>,
});

function canUseWebgl() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

type SceneVersion = "original" | "variant" | "preview";

export default function Experience({ initialWorld, source, error }: { initialWorld: World; source: string; error?: string }) {
  const displayTime = (minute: number | null) => formatTime(minute, initialWorld.originMinute);
  const { roles } = initialWorld.presentation;
  const featuredEvent = initialWorld.events.find(event => event.id === initialWorld.featuredMoment.eventId)!;
  const goal: Goal = {
    eventId: featuredEvent.id,
    time: featuredEvent.at!,
    placeId: initialWorld.featuredMoment.placeId,
    requiredTypes: [...new Set(featuredEvent.requirements.map(requirement => requirement.type))],
  };

  const [patch, setPatch] = useState<RealityPatch>({ worldId: initialWorld.id, baseRevision: initialWorld.baseRevision, operations: [] });
  const [time, setTime] = useState(20);
  const timeRef = useRef(20);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [compareOn, setCompareOn] = useState(false);
  const [selected, setSelected] = useState<string | null>(initialWorld.visitorClosure.connectionId);
  const [search, setSearch] = useState<SearchResult | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [sceneVersion, setSceneVersion] = useState<SceneVersion>("variant");
  const [momentFrame, setMomentFrame] = useState(false);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [newVersion, setNewVersion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const frame = window.requestAnimationFrame(() => {
      setWebgl(canUseWebgl());
      setReducedMotion(media.matches);
    });
    const onMotionPreference = () => {
      const prefersReduced = media.matches;
      setReducedMotion(prefersReduced);
      if (prefersReduced) setPlaying(false);
    };
    media.addEventListener("change", onMotionPreference);
    return () => {
      window.cancelAnimationFrame(frame);
      media.removeEventListener("change", onMotionPreference);
    };
  }, []);

  useEffect(() => {
    if (!playing || reducedMotion || momentFrame) return;
    let frame = 0;
    let previous: number | null = null;
    let lastUiUpdate = 0;
    const tick = (now: number) => {
      if (document.hidden) {
        setPlaying(false);
        return;
      }
      const elapsed = previous === null ? 0 : Math.min((now - previous) / 1000, 0.05);
      previous = now;
      const next = Math.min(initialWorld.horizon, timeRef.current + elapsed * 8 * speed);
      timeRef.current = next;
      if (now - lastUiUpdate >= 100 || next >= initialWorld.horizon) {
        setTime(next);
        lastUiUpdate = now;
      }
      if (next >= initialWorld.horizon) {
        setPlaying(false);
        return;
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    const onVisibility = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [playing, reducedMotion, momentFrame, initialWorld.horizon, speed]);

  const seek = useCallback((minute: number) => {
    const next = Math.max(0, Math.min(initialWorld.horizon, minute));
    timeRef.current = next;
    setTime(next);
  }, [initialWorld.horizon]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.matches("input,button,select,textarea,[contenteditable=true]") || target.isContentEditable)) return;
      if (event.code === "Space") {
        event.preventDefault();
        if (!reducedMotion && !momentFrame) setPlaying(value => !value);
      }
      if (event.code === "ArrowRight") seek(timeRef.current + 1);
      if (event.code === "ArrowLeft") seek(timeRef.current - 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [seek, reducedMotion, momentFrame]);

  useEffect(() => {
    if (source !== "Live Sanity") return;
    const checkVersion = async () => {
      try {
        const response = await fetch("/api/version");
        if (!response.ok) return;
        const data = await response.json() as { revisionId: string | null };
        if (data.revisionId && data.revisionId !== initialWorld.baseRevision) setNewVersion(true);
      } catch {
        // A polling failure does not replace the visitor's pinned snapshot.
      }
    };
    const timer = window.setInterval(checkVersion, 60000);
    return () => window.clearInterval(timer);
  }, [source, initialWorld.baseRevision]);

  const originalResult = useMemo(() => simulate(initialWorld), [initialWorld]);
  const variantWorld = useMemo(() => applyPatch(initialWorld, patch), [initialWorld, patch]);
  const variantResult = useMemo(() => simulate(variantWorld), [variantWorld]);
  const closureLocked = patch.operations.some(operation => operation.type === "setConnectionEnd");
  const chosen = search?.alternatives.find(alternative => alternative.id === previewId);

  const previewWorld = useMemo(() => chosen
    ? applyPatch(variantWorld, { worldId: initialWorld.id, baseRevision: initialWorld.baseRevision, operations: chosen.operations }, patch.operations)
    : null, [chosen, variantWorld, initialWorld.id, initialWorld.baseRevision, patch.operations]);
  const previewResult = useMemo(() => previewWorld ? simulate(previewWorld) : null, [previewWorld]);

  const activeWorld = sceneVersion === "original" ? initialWorld : sceneVersion === "preview" && previewWorld ? previewWorld : variantWorld;
  const activeResult = sceneVersion === "original" ? originalResult : sceneVersion === "preview" && previewResult ? previewResult : variantResult;
  const activeDifferences = useMemo(() => compare(originalResult, activeResult), [originalResult, activeResult]);
  const activeLabel = sceneVersion === "original" ? "Original" : sceneVersion === "preview" && previewWorld ? "Recovery preview" : "Your variant";
  const activeTarget = getEvent(activeResult, goal.eventId);
  const activeSceneTime = momentFrame ? goal.time : time;
  const courierSample = sampleEntity(activeWorld, activeResult, activeWorld.presentation.roles.courierEntityId, activeSceneTime);
  const courierPlace = courierSample.placeId ? activeWorld.entities.find(entity => entity.id === courierSample.placeId)?.name : undefined;

  const delivery = getEvent(variantResult, roles.deliveryEventId);
  const ceremony = getEvent(variantResult, roles.ceremonyEventId);
  const artifact = activeResult.artifacts.find(item => item.id === roles.storyArtifactId)!;
  const selectedEvent = activeResult.events.find(event => event.id === selected);
  const selectedConnection = activeWorld.connections.find(connection => connection.id === selected);
  const selectedEntity = activeWorld.entities.find(entity => entity.id === selected);
  const eventRows = initialWorld.presentation.eventOrder.map(id => activeResult.events.find(event => event.id === id)!);

  const selectEvent = (eventId: string) => {
    const row = activeDifferences.find(item => item.id === eventId);
    setSelected(eventId);
    seek(eventId === goal.eventId ? goal.time : row?.variant.time ?? timeRef.current);
  };

  const playbackLabel = (event: typeof eventRows[number], timing: string) => {
    if (event.status === "unknown") return "Indeterminate";
    if (event.status === "impossible") return time >= (event.time ?? 0) ? "Moment missed" : "Impossible as planned";
    if (event.route) {
      if (time >= event.route.arrive) return "Occurred";
      const position = sampleRoute(event.route, time);
      if (time >= event.route.plannedDepart && position.status === "waiting") {
        const stop = activeWorld.entities.find(entity => entity.id === position.placeId)?.name ?? "a stop";
        return "Waiting at " + stop;
      }
      if (position.status === "moving") return "In transit";
    }
    if (event.time !== null && time >= event.time) return "Occurred";
    return timing === "unchanged" ? "On schedule" : timing;
  };

  const eventStatusMessage = (event: typeof eventRows[number]) => {
    if (event.status === "unknown") return "Available data cannot settle this event.";
      if (event.status === "impossible") return time >= (event.time ?? 0) ? "This moment was missed." : "This event cannot happen as planned.";
      if (event.route) {
        if (time >= event.route.arrive) return "This delivery occurred at " + displayTime(event.route.arrive) + ".";
        const position = sampleRoute(event.route, time);
        if (time >= event.route.plannedDepart && position.status === "waiting") {
          const stop = activeWorld.entities.find(entity => entity.id === position.placeId)?.name ?? "an available connection";
          return "The courier is waiting at " + stop + ". Delivery is expected at " + displayTime(event.route.arrive) + ".";
        }
        if (position.status === "moving") return "The courier is in transit. Delivery is expected at " + displayTime(event.route.arrive) + ".";
    }
    const completion = event.time;
    if (completion !== null && time >= completion) return "This event occurred at " + displayTime(completion) + ".";
    return "This event can happen at " + displayTime(completion) + ".";
  };

  const changeClosure = () => {
    const operations: Operation[] = closureLocked
      ? []
      : [{ type: "setConnectionEnd", connectionId: initialWorld.visitorClosure.connectionId, value: initialWorld.visitorClosure.end }];
    setPatch({ worldId: initialWorld.id, baseRevision: initialWorld.baseRevision, operations });
    setSearch(null);
    setPreviewId(null);
    setSceneVersion("variant");
    setMomentFrame(false);
    setSelected(initialWorld.visitorClosure.connectionId);
    setPlaying(false);
    seek(20);
  };

  const keepMoment = () => {
    const nextSearch = keepThisMoment(initialWorld, patch, goal);
    setSearch(nextSearch);
    setPreviewId(nextSearch.alternatives[0]?.id ?? null);
    setSceneVersion(nextSearch.alternatives.length ? "preview" : "variant");
    setSelected(goal.eventId);
    setPlaying(false);
    setMomentFrame(true);
    seek(goal.time);
  };

  const chooseAlternative = (alternativeId: string) => {
    setPreviewId(alternativeId);
    setSceneVersion("preview");
    seek(goal.time);
  };

  const applyChosen = () => {
    if (!chosen) return;
    const nextPatch = applyAlternative(initialWorld, patch, goal, chosen);
    setPatch(nextPatch);
    setSearch(null);
    setPreviewId(null);
    setSceneVersion("variant");
    setSelected(goal.eventId);
    setPlaying(false);
    seek(goal.time);
  };

  const reset = () => {
    setPatch({ worldId: initialWorld.id, baseRevision: initialWorld.baseRevision, operations: [] });
    setSearch(null);
    setPreviewId(null);
    setSceneVersion("variant");
    setMomentFrame(false);
    setSelected(initialWorld.visitorClosure.connectionId);
    setPlaying(false);
    seek(20);
  };

  const claimMessage = artifact.compatibility === "supported"
    ? "The article's claim is supported by the current events."
    : artifact.compatibility === "unsupported"
      ? "Claim unsupported by the variant. The planned photograph is not supported by the events."
      : "The article's claim is indeterminate because available data cannot settle the event.";

  return (
    <main className="experience">
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon" aria-hidden="true">✳</span>
          <div><strong>BUTTERFLY</strong><small>Change the world. Keep the moment.</small></div>
        </div>
        <div className="top-actions">
          <span className="source">{source}</span>
          <button className="quiet" onClick={() => setCompareOn(value => !value)} aria-pressed={compareOn}>
            {compareOn ? "Hide original traces" : "Show original traces"}
          </button>
        </div>
      </header>

      {error && <div className="error" role="alert">Live Sanity connection error: {error}</div>}
      {newVersion && <div className="error" role="status">A new world revision is available. Your variant stays anchored to this snapshot.</div>}

      <section className="workspace">
        <div className="scene-shell">
          <div className="scene-meta"><span>{initialWorld.title.toUpperCase()}</span><strong>{displayTime(time)}</strong></div>
          {webgl === false ? (
            <div className="fallback">
              <h2>3D view unavailable</h2>
              <p>WebGL could not start. This text view follows the same verified events and timeline.</p>
              <ul>{activeWorld.entities.filter(entity => entity.kind === "place").map(place => <li key={place.id}>{place.name}</li>)}</ul>
              <p>At {displayTime(time)}, delivery is {delivery.status}, the featured photograph is {activeTarget.status}, and the ceremony is {ceremony.status}.</p>
            </div>
          ) : (
            <Diorama
              world={activeWorld}
              result={activeResult}
              originalWorld={initialWorld}
              originalResult={originalResult}
              time={time}
              timeRef={timeRef}
              compare={compareOn && sceneVersion !== "original"}
              preview={sceneVersion === "preview"}
              momentFrame={momentFrame}
              reducedMotion={reducedMotion}
              selected={selected}
              onSelect={setSelected}
              onSceneReady={() => setSceneReady(true)}
            />
          )}
          {sceneReady && webgl && <span className="scene-ready" data-testid="scene-ready">Neighborhood rendered</span>}
          <div className="scene-version" aria-live="polite">{activeLabel}{momentFrame ? " · MomentFrame" : ""}</div>
          <div className="scene-presence" aria-live="polite">
            {courierSample.status === "waiting" ? "Courier waiting at " + (courierPlace ?? "a scheduled stop") :
              courierSample.status === "moving" ? "Courier moving on the " + (courierSample.role ?? "road") :
                courierSample.status === "unknown" ? "Courier position indeterminate" :
                  "Courier at " + (courierPlace ?? "a known place")}
          </div>
          <div className="scene-legend" aria-label="Scene legend">
            {sceneVersion === "variant" && <span><i className="swatch variant" />Your variant · solid path</span>}
            {sceneVersion === "original" && <span><i className="swatch original" />Original · complete scene</span>}
            {sceneVersion === "preview" && <span><i className="swatch recovery" />Recovery preview · dashed path</span>}
            {compareOn && sceneVersion !== "original" && <span><i className="swatch original" />Original trace at the same time</span>}
            {momentFrame && activeTarget.status === "impossible" && <span>Missed here · original composition remains viewable</span>}
          </div>
          {momentFrame && (
            <div className="moment-frame-controls" role="group" aria-label="MomentFrame versions">
              <div><span className="eyebrow">MOMENTFRAME</span><strong>{displayTime(goal.time)} · {activeLabel}</strong></div>
              <div className="version-tabs">
                <button className={sceneVersion === "original" ? "selected" : ""} onClick={() => setSceneVersion("original")}>Original</button>
                <button className={sceneVersion === "variant" ? "selected" : ""} onClick={() => setSceneVersion("variant")}>Your variant</button>
                {previewWorld && <button className={sceneVersion === "preview" ? "selected" : ""} onClick={() => setSceneVersion("preview")}>Recovery preview</button>}
              </div>
              <button className="frame-close" onClick={() => setMomentFrame(false)}>Return to neighborhood</button>
            </div>
          )}
        </div>

        <aside className="side">
          <div className="eyebrow">ONE CHANGE, MANY CONSEQUENCES</div>
          <h1>A crossing changes an afternoon.</h1>
          <p className="intro">Move the bridge closure earlier. Follow the delivery, then preserve this photograph without reopening the bridge.</p>
          <button className={closureLocked ? "action secondary" : "action"} onClick={changeClosure}>
            {closureLocked ? "Restore bridge schedule" : "Close bridge at " + displayTime(initialWorld.visitorClosure.end)}
          </button>
          {closureLocked && <span className="lock">✳ Bridge closure locked during recovery</span>}

          <div className="event-list">
              <div className="section-label">THE DAY <span>{activeLabel.toUpperCase()}</span></div>
              {eventRows.map(event => {
                const row = activeDifferences.find(item => item.id === event.id)!;
                const label = playbackLabel(event, row.timing);
                return (
                  <button key={event.id} className={"event-row " + (selected === event.id ? "active" : "")} onClick={() => selectEvent(event.id)} aria-label={event.name + ": " + label}>
                    <span className="event-status" data-state={event.status} aria-hidden="true">{event.status === "possible" ? "●" : event.status === "unknown" ? "?" : "×"}</span>
                    <span><strong>{event.name}</strong><small>{label}</small></span>
                    <b>{sceneVersion === "original" ? displayTime(event.time) : <>{displayTime(row.original.time)} <em>→</em> {displayTime(event.time)}</>}</b>
                </button>
              );
            })}
            <button className="gazette-row" onClick={() => setSelected(roles.storyArtifactId)} aria-label={artifact.title + " " + artifact.compatibility}>
              {artifact.title}<strong>{artifact.compatibility}</strong>
            </button>
          </div>

          <div className="inspector" aria-live="polite">
            <div className="section-label">INSPECTOR</div>
            <h2>{selectedEvent?.name ?? selectedConnection?.label ?? selectedConnection?.id ?? selectedEntity?.name ?? (selected === roles.storyArtifactId ? artifact.title : "Select a place or moment")}</h2>
            {selectedEvent ? <>
              <p>{eventStatusMessage(selectedEvent)}</p>
              {selectedEvent.reasons.map((reason, index) => (
                <div className={"reason " + (reason.status === "possible" ? "satisfied" : "")} key={index}>
                  <strong>{reason.requirement.type} · {reason.status}</strong>
                  <span>Observed: {reason.observed}</span>
                  {reason.causes.length > 0 && <small>Explained by {reason.causes.map(cause => {
                    const event = activeResult.events.find(item => item.id === cause);
                    return event ? <button key={cause} className="cause-link" onClick={() => selectEvent(cause)}>{event.name}</button> : cause;
                  })}</small>}
                  {reason.involved.length > 0 && <small>Involved: {reason.involved.map(id => activeWorld.entities.find(entity => entity.id === id)?.name ?? activeWorld.entities.find(entity => entity.id === id)?.id ?? id).join(", ")}</small>}
                </div>
              ))}
            </> : selectedConnection ? <p>{selectedConnection.enabled ? "Available" : "Inactive"} · {selectedConnection.duration} minute crossing · current closing time {displayTime(selectedConnection.windows[0].end)}.</p>
              : selected === roles.storyArtifactId ? <p>{claimMessage} “{activeWorld.artifacts.find(item => item.id === roles.storyArtifactId)!.body}”</p>
                : selectedEntity ? <p>{selectedEntity.name}. {selectedEntity.initialPlaceId ? "Starts at " + (activeWorld.entities.find(item => item.id === selectedEntity.initialPlaceId)?.name ?? selectedEntity.initialPlaceId) + "." : "Part of this neighborhood."}</p>
                  : <p>Choose an event, person, place or connection in the town to inspect its requirements and causes.</p>}
          </div>
        </aside>
      </section>

      <section className="bottom">
        <div className="timeline" aria-label="Scenario timeline">
          <button className="play" onClick={() => setPlaying(value => !value)} disabled={reducedMotion || momentFrame} aria-label={playing ? "Pause" : "Play"}>{playing ? "Ⅱ" : "▶"}</button>
          <label htmlFor="time-slider">TIME <strong>{displayTime(time)}</strong></label>
          <input id="time-slider" aria-label="Seek scenario time" type="range" min="0" max={initialWorld.horizon} step="0.05" value={time} onChange={event => seek(Number(event.target.value))} />
          <span>{displayTime(initialWorld.horizon)}</span>
          <label className="speed-control">SPEED
            <select aria-label="Playback speed" value={speed} onChange={event => setSpeed(Number(event.target.value))}>
              <option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option>
            </select>
          </label>
          <button className="quiet" onClick={reset}>Reset variant</button>
        </div>

        <div className="moment">
          <div>
            <span className="eyebrow">THE MOMENT TO KEEP</span>
            <h2>{activeTarget.status === "possible" ? sceneVersion === "preview" ? "Recovery preview keeps the photograph possible at " + displayTime(goal.time) + "." : time >= goal.time ? "The photograph happened at " + displayTime(goal.time) + "." : "The photograph can happen." : activeTarget.status === "unknown" ? "The photograph remains indeterminate." : time >= goal.time ? "The photograph is now a missed moment." : "The photograph cannot happen as planned."}</h2>
            <p>{displayTime(goal.time)} · {initialWorld.entities.find(entity => entity.id === goal.placeId)?.name} · {initialWorld.featuredMoment.subjectEntityIds.map(id => initialWorld.entities.find(entity => entity.id === id)?.name ?? id).join(", ")} · {initialWorld.entities.find(entity => entity.id === initialWorld.featuredMoment.propEntityIds[0])?.name}</p>
            {activeTarget.status === "impossible" && <small>The original composition remains available in MomentFrame. Its flowers do not appear in {activeLabel.toLowerCase()} before delivery and setup.</small>}
            {activeTarget.status === "unknown" && <small>Missing or incomplete world data cannot establish whether this composition is possible.</small>}
          </div>
          <button className="keep" onClick={keepMoment}>Keep this moment <span aria-hidden="true">↗</span></button>
        </div>

        {search && (
          <div className="alternatives" aria-live="polite">
            <div className="alternative-heading">
              <div><span className="eyebrow">VERIFIED IN THE ENGINE</span><h2>{search.status === "found" ? "Ways to keep the moment" : search.status === "limit-reached" && search.alternatives.length ? "Verified options from a partial search" : search.status === "already-satisfied" ? "Already possible" : search.status === "indeterminate" ? "Result indeterminate" : "No alternative in this domain"}</h2></div>
              <button className="quiet" onClick={() => { setSearch(null); setPreviewId(null); setSceneVersion("variant"); }}>Close</button>
            </div>
            <p className="method">
              Search checked {search.examined} of {search.domainSize} candidates, with at most {search.maxInterventions} interventions and {search.maxCandidates} candidates. It ranks fewer changes first, then smaller time shifts.
              {search.status === "limit-reached" && " The limit was reached; this does not prove impossibility."}
              {search.status === "exhausted" && " The finite configured domain was fully explored."}
              {search.status === "indeterminate" && " Incomplete world data leaves the result unsettled."}
            </p>
            <div className="cards">
              {search.alternatives.map((alternative, index) => {
                const previewDelivery = getEvent(alternative.result, roles.deliveryEventId);
                const previewSetup = getEvent(alternative.result, roles.setupEventId);
                const changes = alternative.operations.map(operation => operation.type === "setEventTime"
                  ? "Depart at " + displayTime(operation.value)
                  : (operation.value ? "Activate " : "Deactivate ") + (initialWorld.connections.find(connection => connection.id === operation.connectionId)?.label ?? operation.connectionId));
                return (
                  <button key={alternative.id} className={"alternative " + (previewId === alternative.id ? "chosen" : "")} onClick={() => chooseAlternative(alternative.id)} aria-label={changes.join(" and ")}>
                    <span>OPTION {String(index + 1).padStart(2, "0")}</span>
                    <strong>{changes.join(" + ")}</strong>
                    <small>Delivery {displayTime(previewDelivery.time)} · Setup {displayTime(previewSetup.time)} · Photograph {getEvent(alternative.result, goal.eventId).status}</small>
                  </button>
                );
              })}
            </div>
            {chosen && previewWorld && previewResult && (
              <div className="apply-row">
                <p>Recovery preview is read-only. The bridge closure remains locked. Photo at {displayTime(goal.time)}: {getEvent(previewResult, goal.eventId).status}.</p>
                <button className="action" onClick={applyChosen}>Apply to my variant</button>
              </div>
            )}
          </div>
        )}
        <div className="sr-summary" aria-live="polite">
          {activeLabel}: delivery {playbackLabel(getEvent(activeResult, roles.deliveryEventId), "on schedule")}, setup {playbackLabel(getEvent(activeResult, roles.setupEventId), "on schedule")}, photograph {playbackLabel(getEvent(activeResult, goal.eventId), "on schedule")}, ceremony {playbackLabel(getEvent(activeResult, roles.ceremonyEventId), "on schedule")}. Article claim {activeResult.artifacts.find(item => item.id === roles.storyArtifactId)?.compatibility ?? "unknown"}.
        </div>
      </section>
    </main>
  );
}
