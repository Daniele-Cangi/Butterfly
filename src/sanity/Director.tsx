"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useClient } from "sanity";
import dynamic from "next/dynamic";
import { fromDraftDocument } from "./adapter";
import { applyPatch, type World } from "../world/model";
import { formatTime, getEvent, simulate } from "../engine/simulate";
import { WORLD_ID } from "./read";

const Diorama = dynamic(() => import("../scene/Diorama"), { ssr: false });

export default function Director() {
  const client = useClient({ apiVersion: "2025-02-19" });
  const [world, setWorld] = useState<World | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [reloadCount, setReloadCount] = useState(0);
  const [time, setTime] = useState(50);
  const timeRef = useRef(50);
  const [closed, setClosed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const reload = async () => {
      try {
        const [draft, published] = await Promise.all([
          client.getDocument("drafts.butterfly.world." + WORLD_ID),
          client.getDocument("butterfly.world." + WORLD_ID),
        ]);
        if (!active) return;
        const document = draft ?? published;
        if (!document) throw new Error("Seed the Butterfly authoring document first");
        const validated = fromDraftDocument(document);
        setWorld(validated);
        setClosed(false);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (active) setRefreshing(false);
      }
    };
    void reload();
    return () => { active = false; };
  }, [client, reloadCount]);

  useEffect(() => { timeRef.current = time; }, [time]);

  const original = useMemo(() => world ? simulate(world) : null, [world]);
  const variantWorld = useMemo(() => {
    if (!world || !closed) return world;
    return applyPatch(world, {
      worldId: world.id,
      baseRevision: world.baseRevision,
      operations: [{ type: "setConnectionEnd", connectionId: world.visitorClosure.connectionId, value: world.visitorClosure.end }],
    });
  }, [world, closed]);
  const variant = useMemo(() => variantWorld ? simulate(variantWorld) : null, [variantWorld]);

  if (error) return <div style={{ padding: 30 }}>Director cannot validate this draft: {error}</div>;
  if (refreshing || !world || !original || !variant || !variantWorld) return <div style={{ padding: 30 }}>Loading Butterfly draft…</div>;
  const photo = getEvent(variant, world.featuredMoment.eventId);
  const displayTime = formatTime(time, world.originMinute);

  return (
    <div style={{ padding: 18, minHeight: "100vh", display: "grid", gridTemplateRows: "auto minmax(420px, 1fr) auto", gap: 12, background: "#f4f1e8" }}>
      <div>
        <h1 style={{ margin: 0 }}>Director · {world.title}</h1>
        <p style={{ margin: "4px 0" }}>Draft data through the same validator, engine and scene. Publishing requires the authorized CLI.</p>
        <button onClick={() => { setRefreshing(true); setError(null); setReloadCount(count => count + 1); }}>Reload draft</button>
        <p style={{ margin: "4px 0", fontSize: 12 }}>Featured photograph · {formatTime(world.events.find(event => event.id === world.featuredMoment.eventId)?.at ?? null, world.originMinute)} · {photo.status}</p>
      </div>
      <div style={{ position: "relative", minHeight: 420, background: "#e8e4d9" }}>
        <Diorama
          world={variantWorld}
          result={variant}
          originalWorld={world}
          originalResult={original}
          time={time}
          timeRef={timeRef}
          compare
          preview={false}
          momentFrame={false}
          reducedMotion={false}
          selected={selected}
          onSelect={setSelected}
        />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button onClick={() => setClosed(value => !value)}>{closed ? "Restore bridge" : "Close bridge at " + formatTime(world.visitorClosure.end, world.originMinute)}</button>
        <label htmlFor="director-time">Scenario time</label>
        <input id="director-time" aria-label="Director time" type="range" min="0" max={world.horizon} value={time} onChange={event => setTime(Number(event.target.value))} />
        <span>{displayTime}</span>
        <span>Delivery: {formatTime(getEvent(variant, world.presentation.roles.deliveryEventId).time, world.originMinute)}</span>
        <span>Photograph: {photo.status}</span>
      </div>
    </div>
  );
}
