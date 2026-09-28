"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyPatch, type Operation, type RealityPatch, type World } from "../world/model";
import { compare, formatTime, getEvent, sampleEntity, sampleRoute, simulate } from "../engine/simulate";
import { applyAlternative, keepThisMoment, type Goal, type SearchOptions, type SearchResult } from "../engine/search";
import { selectMomentEntityPresence } from "../scene/momentPresence";
import { explainDay, explainIntervention } from "./story";

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
const requirementLabels: Record<string, string> = {
  eventOccurred: "Prior event",
  entityAt: "Position",
  factEquals: "World condition",
  route: "Available route",
};

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
  const [time, setTime] = useState(goal.time);
  const timeRef = useRef(goal.time);
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
  const [keepDeparture, setKeepDeparture] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [announcement, setAnnouncement] = useState("");

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

  const seek = useCallback((minute: number, force = false) => {
    if (momentFrame && !force) return;
    const next = Math.max(0, Math.min(initialWorld.horizon, minute));
    timeRef.current = next;
    setTime(next);
  }, [initialWorld.horizon, momentFrame]);

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
  const originalDeparture = initialWorld.events.find(event => event.id === roles.deliveryEventId)?.at;
  const ferryControl = initialWorld.visitorFerryOpening;
  const ferryOpening = ferryControl ? variantWorld.connections.find(connection => connection.id === ferryControl.connectionId)?.windows[0].start : undefined;
  const searchOptions: SearchOptions = keepDeparture && originalDeparture !== undefined
    ? { constraints: { departureNotBefore: { eventId: roles.deliveryEventId, minute: originalDeparture } } }
    : {};
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
  const frameStatus = activeTarget.status === "possible" ? "Possible at target" : activeTarget.status === "impossible" ? "Missed at target" : "Unresolved";
  const activeSceneTime = momentFrame ? goal.time : time;
  const effectiveTime = activeSceneTime;
  const momentPresenceSummary = [...initialWorld.featuredMoment.subjectEntityIds, ...initialWorld.featuredMoment.propEntityIds]
    .map(entityId => {
      const entity = activeWorld.entities.find(item => item.id === entityId)!;
      const presence = selectMomentEntityPresence(activeWorld, activeResult, entityId, effectiveTime);
      const state = presence.kind === "present" ? "present" : presence.kind === "absent" ? "absent" : "uncertain";
      const locationId = presence.kind === "absent" ? presence.placeId : presence.kind === "uncertain" ? presence.lastKnownPlaceId : undefined;
      const location = locationId ? activeWorld.entities.find(item => item.id === locationId)?.name : undefined;
      return `${entity.name}: ${state}${location ? ` · ${location}` : ""}`;
    }).join(" · ");
  const courierSample = sampleEntity(activeWorld, activeResult, activeWorld.presentation.roles.courierEntityId, activeSceneTime);
  const courierPlace = courierSample.placeId ? activeWorld.entities.find(entity => entity.id === courierSample.placeId)?.name : undefined;

  const activeDelivery = getEvent(activeResult, roles.deliveryEventId);
  const activeCeremony = getEvent(activeResult, roles.ceremonyEventId);
  const departureMinute = activeWorld.events.find(event => event.id === roles.deliveryEventId)?.at ?? 0;
  const artifact = activeResult.artifacts.find(item => item.id === roles.storyArtifactId)!;
  const selectedEvent = activeResult.events.find(event => event.id === selected);
  const selectedConnection = activeWorld.connections.find(connection => connection.id === selected);
  const selectedEntity = activeWorld.entities.find(entity => entity.id === selected);
  const eventRows = initialWorld.presentation.eventOrder.map(id => activeResult.events.find(event => event.id === id)!);

  const selectEvent = (eventId: string) => {
    const row = activeDifferences.find(item => item.id === eventId);
    setSelected(eventId);
    setShowEvidence(true);
    seek(eventId === goal.eventId ? goal.time : row?.variant.time ?? timeRef.current);
  };

  const playbackLabel = (event: typeof eventRows[number], timing: string) => {
    if (event.status === "unknown") return "Indeterminate";
    if (event.status === "impossible") return effectiveTime >= (event.time ?? 0) ? "Moment missed" : "Impossible as planned";
    if (event.route) {
      if (effectiveTime >= event.route.arrive) return "Occurred";
      const position = sampleRoute(event.route, effectiveTime);
      if (effectiveTime >= event.route.plannedDepart && position.status === "waiting") {
        const stop = activeWorld.entities.find(entity => entity.id === position.placeId)?.name ?? "a stop";
        return "Waiting at " + stop;
      }
      if (position.status === "moving") return "In transit";
    }
    if (event.time !== null && effectiveTime >= event.time) return "Occurred";
    return timing === "unchanged" ? "On schedule" : timing;
  };

  const eventStatusMessage = (event: typeof eventRows[number]) => {
    if (event.status === "unknown") return "Available data cannot settle this event.";
      if (event.status === "impossible") return effectiveTime >= (event.time ?? 0) ? "This moment was missed." : "This event cannot happen as planned.";
      if (event.route) {
        if (effectiveTime >= event.route.arrive) return "This delivery occurred at " + displayTime(event.route.arrive) + ".";
        const position = sampleRoute(event.route, effectiveTime);
        if (effectiveTime >= event.route.plannedDepart && position.status === "waiting") {
          const stop = activeWorld.entities.find(entity => entity.id === position.placeId)?.name ?? "an available connection";
          return "The courier is waiting at " + stop + ". Delivery is expected at " + displayTime(event.route.arrive) + ".";
        }
        if (position.status === "moving") return "The courier is in transit. Delivery is expected at " + displayTime(event.route.arrive) + ".";
    }
    const completion = event.time;
    if (completion !== null && effectiveTime >= completion) return "This event occurred at " + displayTime(completion) + ".";
    return "This event can happen at " + displayTime(completion) + ".";
  };

  const changeClosure = () => {
    const operations: Operation[] = closureLocked
      ? patch.operations.filter(operation => operation.type !== "setConnectionEnd")
      : [...patch.operations, { type: "setConnectionEnd", connectionId: initialWorld.visitorClosure.connectionId, value: initialWorld.visitorClosure.end }];
    const nextPatch = { worldId: initialWorld.id, baseRevision: initialWorld.baseRevision, operations };
    setPatch(nextPatch);
    setSearch(null);
    setPreviewId(null);
    setSceneVersion("variant");
    setMomentFrame(false);
    setShowEvidence(false);
    setSelected(initialWorld.visitorClosure.connectionId);
    setPlaying(false);
    seek(goal.time, true);
    setAnnouncement(closureLocked ? "Original bridge schedule restored." : `Bridge now closes at ${displayTime(initialWorld.visitorClosure.end)}. The chosen composition is missed.`);
  };

  const viewMoment = (version: "original" | "variant") => {
    setSceneVersion(version);
    setSelected(goal.eventId);
    setPlaying(false);
    setMomentFrame(true);
    seek(goal.time, true);
    setAnnouncement(`Viewing ${version === "original" ? "the original" : "your variant"} at ${displayTime(goal.time)}.`);
  };

  const findAlternatives = () => {
    const nextSearch = keepThisMoment(initialWorld, patch, goal, searchOptions);
    setSearch(nextSearch);
    setPreviewId(null);
    setSceneVersion("variant");
    setMomentFrame(true);
    setSelected(goal.eventId);
    setShowEvidence(false);
    setPlaying(false);
    seek(goal.time, true);
    setAnnouncement(nextSearch.status === "found" ? `${nextSearch.alternatives.length} distinct alternatives found. None has been applied.` : nextSearch.status === "exhausted" ? "No alternative preserves this composition in the explored domain." : `Search result: ${nextSearch.status}.`);
  };

  const chooseAlternative = (alternativeId: string) => {
    setPreviewId(alternativeId);
    setSceneVersion("preview");
    seek(goal.time, true);
    setAnnouncement("Recovery preview selected. Your variant has not changed.");
  };

  const applyChosen = () => {
    if (!chosen) return;
    let nextPatch: RealityPatch;
    try { nextPatch = applyAlternative(initialWorld, patch, goal, chosen, searchOptions); }
    catch { setSearch(null); setPreviewId(null); setSceneVersion("variant"); setAnnouncement("This preview is stale. Find alternatives again."); return; }
    setPatch(nextPatch);
    setSearch(null);
    setPreviewId(null);
    setSceneVersion("variant");
    setSelected(goal.eventId);
    setPlaying(false);
    seek(goal.time, true);
    setAnnouncement(`Solution applied to your variant. The chosen composition is possible at ${displayTime(goal.time)}; the bridge closure remains in place.`);
  };

  const changeFerryOpening = (value: number) => {
    if (!ferryControl) return;
    const baseStart = initialWorld.connections.find(connection => connection.id === ferryControl.connectionId)?.windows[0].start;
    const operations: Operation[] = patch.operations.filter(operation => !(operation.type === "setConnectionStart" && operation.connectionId === ferryControl.connectionId));
    if (value !== baseStart) operations.push({ type: "setConnectionStart", connectionId: ferryControl.connectionId, value });
    setPatch({ ...patch, operations });
    setSearch(null); setPreviewId(null); setSceneVersion("variant");
    setAnnouncement(`Ferry opening set to ${displayTime(value)}. The day's outcomes have been recalculated.`);
  };

  const changeDepartureConstraint = (checked: boolean) => {
    setKeepDeparture(checked);
    if (checked && originalDeparture !== undefined) setPatch(current => ({ ...current, operations: current.operations.filter(operation => !(operation.type === "setEventTime" && operation.eventId === roles.deliveryEventId && operation.value < originalDeparture)) }));
    setSearch(null); setPreviewId(null); setSceneVersion("variant");
    setAnnouncement(checked ? `Recovery must keep the courier's departure at or after ${displayTime(originalDeparture ?? null)}.` : "Earlier departure is allowed again.");
  };

  const reset = () => {
    setPatch({ worldId: initialWorld.id, baseRevision: initialWorld.baseRevision, operations: [] });
    setSearch(null);
    setPreviewId(null);
    setSceneVersion("variant");
    setMomentFrame(false);
    setKeepDeparture(false);
    setShowEvidence(false);
    setSelected(initialWorld.visitorClosure.connectionId);
    setPlaying(false);
    seek(goal.time, true);
    setAnnouncement("Original day restored.");
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
          <svg className="brand-mark" viewBox="0 0 48 48" fill="none" aria-hidden="true">
            <path d="M23 23C13 13 5 10 5 18c0 6 6 10 17 9M25 23c10-10 18-13 18-5 0 6-6 10-17 9M22 27C12 25 8 29 11 35c3 6 8 6 12-6M26 27c10-2 14 2 11 8-3 6-8 6-12-6" />
            <path d="M24 16v20M22 15l-4-6m8 6 4-6" />
          </svg>
          <div><strong>BUTTERFLY</strong><small>Change the world. Keep the moment.</small></div>
        </div>
        <div className="top-actions">
          <span className="source">{source}</span>
          <button className="quiet" onClick={() => setCompareOn(value => !value)} aria-pressed={compareOn}>
            {compareOn ? "Hide original traces" : "Show original traces"}
          </button>
        </div>
      </header>

      {error && <details className="connection-details"><summary>Live connection details</summary><p>Live Sanity connection error: {error}</p></details>}
      {newVersion && <div className="error" role="status">A new world revision is available. Your variant stays anchored to this snapshot.</div>}
      <div className="sr-only" role="status" aria-live="polite">{announcement}</div>

      <section className="workspace">
        <div className={"scene-shell" + (momentFrame ? " frame-mode" : "") + (webgl === false ? " text-scene" : "")} data-version={sceneVersion} data-state={activeTarget.status}>
          <div className="scene-meta">
            <span>WORLD / {initialWorld.title}</span>
            <div className="scene-time"><small>{momentFrame ? "TARGET TIME" : "WORLD TIME"}</small><strong data-testid="scene-clock">{displayTime(effectiveTime)}</strong></div>
          </div>
          {webgl === false ? (
            <div className="fallback">
              <h2>3D view unavailable</h2>
              <p>WebGL could not start. This text view follows the same verified events and timeline.</p>
              <ul>{activeWorld.entities.filter(entity => entity.kind === "place").map(place => <li key={place.id}>{place.name}</li>)}</ul>
              <p>At {displayTime(effectiveTime)}, delivery is {activeDelivery.status}, the featured photograph is {activeTarget.status}, and the ceremony is {activeCeremony.status}.</p>
            </div>
          ) : (
            <Diorama
              world={activeWorld}
              result={activeResult}
              originalWorld={initialWorld}
              originalResult={originalResult}
              time={effectiveTime}
              timeRef={timeRef}
              compare={compareOn && sceneVersion !== "original"}
              preview={sceneVersion === "preview"}
              momentFrame={momentFrame}
              reducedMotion={reducedMotion}
              selected={selected}
              onSelect={id => { setSelected(id); setShowEvidence(true); }}
              onSceneReady={() => setSceneReady(true)}
            />
          )}
          {sceneReady && webgl && <span className="scene-ready" data-testid="scene-ready">Neighborhood rendered</span>}
          <div className="scene-version"><i aria-hidden="true" />{activeLabel}{momentFrame ? " · MomentFrame" : ""}</div>
          <div className="scene-presence">
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
            <div className="moment-frame-controls" role="group" aria-label="MomentFrame versions" data-state={activeTarget.status}>
              <div className="plate-topline"><span>OBSERVATION PLATE / 01</span><span className="plate-status" data-state={activeTarget.status}>{frameStatus}</span></div>
              <div className="plate-heading">
                <div><span className="eyebrow">MOMENTFRAME · {activeLabel}</span><h2>{featuredEvent.name}</h2></div>
                <div className="plate-time"><span>TARGET</span><strong>{displayTime(goal.time)}</strong></div>
              </div>
              <div className="version-tabs" aria-label="Observed version">
                <button aria-label="Original" aria-pressed={sceneVersion === "original"} className={sceneVersion === "original" ? "selected" : ""} onClick={() => { setSceneVersion("original"); setAnnouncement("Showing the original composition at " + displayTime(goal.time)); }}><span aria-hidden="true">01</span>Original</button>
                <button aria-label="Your variant" aria-pressed={sceneVersion === "variant"} className={sceneVersion === "variant" ? "selected" : ""} onClick={() => { setSceneVersion("variant"); setAnnouncement("Showing your variant at " + displayTime(goal.time)); }}><span aria-hidden="true">02</span>Your variant</button>
                {previewWorld && <button aria-label="Recovery preview" aria-pressed={sceneVersion === "preview"} className={sceneVersion === "preview" ? "selected" : ""} onClick={() => { setSceneVersion("preview"); setAnnouncement("Showing the recovery preview at " + displayTime(goal.time)); }}><span aria-hidden="true">03</span>Recovery preview</button>}
              </div>
              <div className="plate-composition"><span>COMPOSITION AT {displayTime(goal.time)}</span><small className="moment-presence" aria-label="Moment participant presence">{momentPresenceSummary}</small></div>
              <div className="plate-footer"><span title={initialWorld.baseRevision}>REV {initialWorld.baseRevision}</span><button className="frame-close" aria-label="Return to neighborhood" onClick={() => setMomentFrame(false)}>Return to neighborhood ↗</button></div>
            </div>
          )}
        </div>

        <aside className="side">
          <div className="side-intro" data-changed={closureLocked}>
            <div className="eyebrow">AN ALTERNATIVE-STORY LABORATORY</div>
            <h1>A crossing changes an afternoon.</h1>
            <p className="intro">{closureLocked ? "The crossing changed. Follow what happened to the chosen composition." : "Change one condition, see the consequences, and find a way to preserve what matters."}</p>
            <p className="case-note">This composition is planned for {displayTime(goal.time)}. Close the bridge early and its arrangement arrives too late. Can you keep the same people, place, time and flowers without reopening the bridge?</p>
            <p className="time-note">The clock is a viewpoint into the day. You can still change an earlier departure while observing {displayTime(effectiveTime)}.</p>
          </div>
          <div className="condition-card" data-state={closureLocked ? "changed" : "original"}>
            <div className="condition-title"><span>CHANGE THE CONDITION</span><strong>Bridge closing time</strong></div>
            <div className="condition-value"><span>{displayTime(initialWorld.connections.find(connection => connection.id === initialWorld.visitorClosure.connectionId)?.windows[0].end ?? initialWorld.horizon)}</span><em>→</em><strong>{closureLocked ? displayTime(initialWorld.visitorClosure.end) : "—"}</strong></div>
            <button className={closureLocked ? "action secondary" : "action"} onClick={changeClosure}>
              {closureLocked ? "Restore bridge schedule" : "Close bridge at " + displayTime(initialWorld.visitorClosure.end)}
            </button>
            {closureLocked && <span className="lock">✳ Bridge closure locked during recovery</span>}
          </div>

          <div className="story-explanation" data-state={activeTarget.status}>
            <span className="section-label">{closureLocked ? "WHAT CHANGED" : "THE ORIGINAL PLAN"}</span>
            <p>{explainDay(activeWorld, activeResult)}</p>
            {closureLocked && <button className="quiet" onClick={() => { setShowEvidence(value => !value); setSelected(goal.eventId); }} aria-expanded={showEvidence}>{showEvidence ? "Hide route and causes" : "Show route and causes"}</button>}
          </div>

          <div className="event-list">
              <div className="section-label">THE DAY <span>{activeLabel.toUpperCase()}</span></div>
              {eventRows.map(event => {
                const row = activeDifferences.find(item => item.id === event.id)!;
                const label = playbackLabel(event, row.timing);
                return (
                  <button key={event.id} className={"event-row " + (selected === event.id ? "active" : "")} data-state={event.status} onClick={() => selectEvent(event.id)} aria-label={event.name + ": " + label}>
                    <span className="event-status" data-state={event.status} aria-hidden="true">{event.status === "possible" ? "●" : event.status === "unknown" ? "?" : "×"}</span>
                    <span><strong>{event.name}</strong><small>{label}</small></span>
                    <b>{sceneVersion === "original" ? displayTime(event.time) : <>{displayTime(row.original.time)} <em>→</em> {displayTime(event.time)}</>}</b>
                </button>
              );
            })}
            <button className="gazette-row" onClick={() => { setSelected(roles.storyArtifactId); setShowEvidence(true); }} aria-label={artifact.title + " " + artifact.compatibility}>
              {artifact.title}<strong>{artifact.compatibility}</strong>
            </button>
          </div>

          <details className="object-index">
            <summary>Explore people, places, objects and routes</summary>
            <div>{activeWorld.entities.map(entity => <button key={entity.id} onClick={() => { setSelected(entity.id); setShowEvidence(true); }}>{entity.name}</button>)}
              {activeWorld.connections.map(connection => <button key={connection.id} onClick={() => { setSelected(connection.id); setShowEvidence(true); }}>{connection.label ?? connection.id}</button>)}
            </div>
          </details>

          {showEvidence && <div className="inspector">
            <div className="section-label">CAUSES & EVIDENCE <span>{activeLabel.toUpperCase()}</span></div>
            <div className="inspector-heading">
              <h2>{selectedEvent?.name ?? selectedConnection?.label ?? selectedConnection?.id ?? selectedEntity?.name ?? (selected === roles.storyArtifactId ? artifact.title : "Select a place or moment")}</h2>
              {selectedEvent && <span className="inspector-badge" data-state={selectedEvent.status}>{selectedEvent.status}</span>}
            </div>
            {selectedEvent ? <>
              <p>{eventStatusMessage(selectedEvent)}</p>
              {selectedEvent.reasons.map((reason, index) => (
                <div className="reason" data-state={reason.status} key={index}>
                  <div className="reason-heading"><span className="reason-symbol" aria-hidden="true">{reason.status === "possible" ? "✓" : reason.status === "impossible" ? "×" : "?"}</span><strong>{requirementLabels[reason.requirement.type] ?? reason.requirement.type}</strong><em>{reason.status}</em></div>
                  <div className="reason-observed"><span>OBSERVED</span><strong>{reason.observed}</strong></div>
                  {reason.causes.length > 0 && <div className="reason-detail"><span>CAUSE</span><div>{reason.causes.map(cause => {
                    const event = activeResult.events.find(item => item.id === cause);
                    return event ? <button key={cause} className="cause-link" aria-label={event.name} onClick={() => selectEvent(cause)}>{event.name}</button> : cause;
                  })}</div></div>}
                  {reason.involved.length > 0 && <div className="reason-detail"><span>INVOLVED</span><div>{reason.involved.map(id => activeWorld.entities.find(entity => entity.id === id)?.name ?? activeWorld.entities.find(entity => entity.id === id)?.id ?? id).join(", ")}</div></div>}
                </div>
              ))}
            </> : selectedConnection ? <p>{selectedConnection.enabled ? "Available" : "Inactive"} · {selectedConnection.duration} minute crossing · current closing time {displayTime(selectedConnection.windows[0].end)}.</p>
              : selected === roles.storyArtifactId ? <p>{claimMessage} “{activeWorld.artifacts.find(item => item.id === roles.storyArtifactId)!.body}”</p>
                : selectedEntity ? <p>{selectedEntity.name}. {selectedEntity.initialPlaceId ? "Starts at " + (activeWorld.entities.find(item => item.id === selectedEntity.initialPlaceId)?.name ?? selectedEntity.initialPlaceId) + "." : "Part of this neighborhood."}</p>
                  : <p>Choose an event, person, place or connection in the town to inspect its requirements and causes.</p>}
          </div>}
        </aside>
      </section>

      <section className="bottom">
        <div className="timeline" aria-label="Scenario timeline">
          <button className="play" onClick={() => setPlaying(value => !value)} disabled={reducedMotion || momentFrame} aria-label={playing ? "Pause" : "Play"}>{playing ? "Ⅱ" : "▶"}</button>
          <label className="timeline-clock" htmlFor="time-slider">{momentFrame ? "FRAME LOCKED" : "WORLD TIME"} <strong data-testid="timeline-clock">{displayTime(effectiveTime)}</strong></label>
          <div className="timeline-track">
            <div className="timeline-ticks" aria-hidden="true" />
          <input id="time-slider" aria-label="Seek scenario time" aria-valuetext={displayTime(effectiveTime)} type="range" min="0" max={initialWorld.horizon} step="0.05" value={effectiveTime} disabled={momentFrame} onChange={event => seek(Number(event.target.value))} />
            <div className="timeline-markers" aria-hidden="true">
              {eventRows.filter(event => event.time !== null).map(event => <i key={event.id} data-state={event.status} data-selected={selected === event.id} style={{ left: Math.max(0, Math.min(100, (event.time! / initialWorld.horizon) * 100)) + "%" }} />)}
            </div>
          </div>
          <span className="timeline-end">{displayTime(initialWorld.horizon)}</span>
          <label className="speed-control">SPEED
            <select aria-label="Playback speed" value={speed} onChange={event => setSpeed(Number(event.target.value))}>
              <option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option>
            </select>
          </label>
          <button className="quiet" onClick={reset}>Reset variant</button>
          <div className="time-jumps" aria-label="Jump to an event time">
            <span>GO TO</span>
            <button disabled={momentFrame} onClick={() => seek(departureMinute)}>Departure {displayTime(departureMinute)}</button>
            {activeDelivery.time !== null && <button disabled={momentFrame} onClick={() => seek(activeDelivery.time!)}>Arrival {displayTime(activeDelivery.time)}</button>}
            <button disabled={momentFrame} onClick={() => seek(goal.time)}>Chosen moment {displayTime(goal.time)}</button>
          </div>
        </div>

        <div className="moment" data-state={activeTarget.status}>
          <div className="moment-stamp"><span>TARGET</span><strong>{displayTime(goal.time)}</strong></div>
          <div className="moment-copy">
            <span className="eyebrow">KEEP THIS MOMENT / THE CHOSEN COMPOSITION</span>
            <h2>{activeTarget.status === "possible" ? sceneVersion === "preview" ? "Recovery preview keeps the photograph possible at " + displayTime(goal.time) + "." : effectiveTime >= goal.time ? "The photograph happened at " + displayTime(goal.time) + "." : "The photograph can happen." : activeTarget.status === "unknown" ? "The photograph remains indeterminate." : effectiveTime >= goal.time ? "The photograph is now a missed moment." : "The photograph cannot happen as planned."}</h2>
            <p>{displayTime(goal.time)} · {initialWorld.entities.find(entity => entity.id === goal.placeId)?.name} · {initialWorld.featuredMoment.subjectEntityIds.map(id => initialWorld.entities.find(entity => entity.id === id)?.name ?? id).join(", ")} · {initialWorld.entities.find(entity => entity.id === initialWorld.featuredMoment.propEntityIds[0])?.name}</p>
            <p className="moment-definition">The goal is this arrangement with these people at this place and time, rather than any photograph later in the day.</p>
            {activeTarget.status === "impossible" && <small>The original composition remains available in MomentFrame. Its flowers do not appear in {activeLabel.toLowerCase()} before delivery and setup.</small>}
            {activeTarget.status === "unknown" && <small>Missing or incomplete world data cannot establish whether this composition is possible.</small>}
          </div>
          <div className="moment-actions">
            <button className="quiet" onClick={() => viewMoment("original")}>View original moment</button>
            <button className="keep" onClick={() => viewMoment("variant")}>Keep this moment <span aria-hidden="true">↗</span></button>
            {closureLocked && <button className="action secondary" onClick={findAlternatives}>Find alternatives</button>}
          </div>
        </div>

        {closureLocked && <section className="constraints" aria-label="Keep also">
          <div><span className="eyebrow">KEEP ALSO / CHOOSE WHAT CANNOT CHANGE</span><p>The clock is a viewpoint, so an earlier departure can still change this day. These limits narrow the recovery search without moving the chosen photograph.</p></div>
          {originalDeparture !== undefined && <label className="departure-constraint"><input type="checkbox" checked={keepDeparture} onChange={event => changeDepartureConstraint(event.target.checked)} /> Do not depart before {displayTime(originalDeparture)}</label>}
          {ferryControl && <label className="ferry-constraint">Ferry starts operating at <select value={ferryOpening} onChange={event => changeFerryOpening(Number(event.target.value))}>{ferryControl.values.map(value => <option key={value} value={value}>{displayTime(value)}</option>)}</select></label>}
        </section>}

        {search && (
          <div className="alternatives">
            <div className="alternative-heading">
              <div><span className="eyebrow">VERIFIED IN THE ENGINE</span><h2>{search.status === "found" ? "Ways to keep the moment" : search.status === "limit-reached" && search.alternatives.length ? "Verified options from a partial search" : search.status === "already-satisfied" ? "Already possible" : search.status === "indeterminate" ? "Result indeterminate" : "No alternative in this domain"}</h2></div>
              <button className="quiet" onClick={() => { setSearch(null); setPreviewId(null); setSceneVersion("variant"); }}>Close</button>
            </div>
            <p className="search-outcome">{search.status === "found" ? `${search.meaningfulCount} distinct verified ${search.meaningfulCount === 1 ? "way preserves" : "ways preserve"} the chosen composition at ${displayTime(goal.time)}. ${search.meaningfulCount > search.alternatives.length ? `Showing the first ${search.alternatives.length} intervention cards. ` : ""}Choose one to preview; your variant has not changed.` : search.status === "exhausted" ? `With these limits, none of the ${search.domainSize} allowed candidate changes preserves the composition at ${displayTime(goal.time)}. You can allow an earlier departure or change the ferry opening. This conclusion covers only the configured domain.` : search.status === "already-satisfied" ? "Your current variant already preserves the chosen composition." : search.status === "limit-reached" ? "The candidate limit was reached. The remaining domain has not been checked." : "Incomplete world data leaves the result unsettled."}</p>
            <details className="search-method"><summary>How the search was checked</summary><p>Checked {search.examined} of {search.domainSize} candidates, with at most {search.maxInterventions} interventions and a limit of {search.maxCandidates} candidates. Fewer changes rank first, then smaller time shifts. {search.meaningfulCount} nonredundant verified intervention choices were found among the checked candidates; {search.alternatives.length} are shown as cards. {search.groupedCount} redundant combinations were omitted from the main cards because their extra operations did not change event outcomes, route IDs or article compatibility. Separate interventions remain separate cards. {search.status === "limit-reached" && "A reached limit does not prove impossibility."}</p></details>
            <div className="cards">
              {search.alternatives.map((alternative, index) => {
                const previewDelivery = getEvent(alternative.result, roles.deliveryEventId);
                const previewSetup = getEvent(alternative.result, roles.setupEventId);
                const changes = alternative.operations.map(operation => operation.type === "setEventTime"
                  ? operation.eventId === roles.deliveryEventId ? "Depart at " + displayTime(operation.value) : `Set ${initialWorld.events.find(event => event.id === operation.eventId)?.name ?? operation.eventId} departure to ${displayTime(operation.value)}`
                  : operation.type === "enableConnection" ? (operation.value ? "Activate " : "Deactivate ") + (initialWorld.connections.find(connection => connection.id === operation.connectionId)?.label ?? operation.connectionId) : "Open route at " + displayTime(operation.value));
                const title = alternative.operations.map(operation => operation.type === "setEventTime" ? operation.eventId === roles.deliveryEventId ? "Leave earlier" : `Reschedule ${initialWorld.events.find(event => event.id === operation.eventId)?.name ?? operation.eventId}` : operation.type === "enableConnection" ? "Use " + (initialWorld.connections.find(connection => connection.id === operation.connectionId)?.label ?? operation.connectionId) : "Adjust opening").join(" + ");
                return (
                  <button key={alternative.id} className={"alternative " + (previewId === alternative.id ? "chosen" : "")} onClick={() => chooseAlternative(alternative.id)} aria-label={changes.join(" and ")} aria-pressed={previewId === alternative.id}>
                    <span className="alternative-index">INTERVENTION / {String(index + 1).padStart(2, "0")}</span>
                    <strong>{title}</strong>
                    <span className="alternative-operation">{changes.join(" + ")}</span>
                    <span className="alternative-story">{explainIntervention(variantWorld, alternative.result, alternative.operations)}</span>
                    <small>Delivery {displayTime(previewDelivery.time)} · Setup {displayTime(previewSetup.time)} · Photograph {getEvent(alternative.result, goal.eventId).status}</small>
                    <span className="alternative-foot"><span>{alternative.operations.length} {alternative.operations.length === 1 ? "CHANGE" : "CHANGES"}</span><span>✓ VERIFIED AT {displayTime(goal.time)}</span></span>
                  </button>
                );
              })}
            </div>
            {chosen && previewWorld && previewResult && (
              <div className="apply-row">
                <p>This is a preview. Applying it changes your variant only; the bridge remains closed. Chosen composition at {displayTime(goal.time)}: {getEvent(previewResult, goal.eventId).status}.</p>
                <button className="action" onClick={applyChosen}>Use this solution</button>
              </div>
            )}
          </div>
        )}
        <div className="sr-summary">
          {activeLabel}: delivery {playbackLabel(getEvent(activeResult, roles.deliveryEventId), "on schedule")}, setup {playbackLabel(getEvent(activeResult, roles.setupEventId), "on schedule")}, photograph {playbackLabel(getEvent(activeResult, goal.eventId), "on schedule")}, ceremony {playbackLabel(getEvent(activeResult, roles.ceremonyEventId), "on schedule")}. Article claim {activeResult.artifacts.find(item => item.id === roles.storyArtifactId)?.compatibility ?? "unknown"}.
        </div>
      </section>
    </main>
  );
}
