"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { sampleEntity, type PositionSample, type Simulation } from "../engine/simulate";
import { getMomentMarkerPosition, isArrangementVisibleAt, selectMomentEntityPresence } from "./momentPresence";
import type { World } from "../world/model";

type Point = [number, number];
type TimeRef = { current: number };
type DioramaProps = {
  world: World;
  result: Simulation;
  originalWorld: World;
  originalResult: Simulation;
  time: number;
  timeRef: TimeRef;
  compare: boolean;
  preview: boolean;
  momentFrame: boolean;
  reducedMotion: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
  onSceneReady?: () => void;
};

const palette = {
  water: "#9eb9b7",
  ground: "#e5d7bb",
  terracotta: "#b96954",
  cream: "#f0e3ca",
  path: "#c5b99f",
  seaInk: "#2c6c77",
  gold: "#d2a037",
};

function Box(props: {
  position: [number, number, number];
  args: [number, number, number];
  color: string;
  onClick?: () => void;
  transparent?: boolean;
  opacity?: number;
}) {
  return (
    <mesh position={props.position} onClick={props.onClick} castShadow receiveShadow>
      <boxGeometry args={props.args} />
      <meshStandardMaterial color={props.color} transparent={props.transparent} opacity={props.opacity} />
    </mesh>
  );
}

function Building({ entity, onClick }: { entity: World["entities"][number]; onClick: () => void }) {
  const [x, z] = entity.visual.position ?? [0, 0];
  const civic = entity.visual.kind === "civic";
  const shop = entity.visual.kind === "shop";
  const width = civic ? 1.8 : shop ? 1.35 : 1.55;
  const roof = civic ? "#9d6c57" : shop ? "#8a7770" : "#ad6d57";
  return (
    <group position={[x, 0, z]} onClick={onClick} name={entity.name}>
      <mesh position={[0, 0.69, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, 1.34, 1.25]} />
        <meshStandardMaterial color={entity.visual.color} />
      </mesh>
      <mesh position={[0, 1.46, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[width * 0.78, 0.64, 4]} />
        <meshStandardMaterial color={roof} />
      </mesh>
      {[-0.4, 0.4].map((offset, index) => (
        <group key={offset}>
          <Box position={[offset, 0.79, 0.64]} args={[0.25, 0.32, 0.04]} color={index ? "#73908d" : "#5c8286"} />
          <Box position={[offset, 0.79, 0.665]} args={[0.035, 0.36, 0.04]} color="#d8c7a7" />
        </group>
      ))}
      <Box position={[0, 0.21, 0.65]} args={[0.36, 0.42, 0.07]} color="#8c6b55" />
      {shop && <Box position={[0, 0.48, 0.72]} args={[1.15, 0.1, 0.3]} color="#d99a74" />}
      {civic && <mesh position={[0, 1.92, 0]}>
        <sphereGeometry args={[0.22, 12, 8]} />
        <meshStandardMaterial color="#d2b07c" />
      </mesh>}
    </group>
  );
}

function Tree({ x, z, scale = 1 }: { x: number; z: number; scale?: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.4 * scale, 0]} castShadow>
        <cylinderGeometry args={[0.075 * scale, 0.12 * scale, 0.8 * scale, 7]} />
        <meshStandardMaterial color="#85664c" />
      </mesh>
      <mesh position={[0, 1.04 * scale, 0]} castShadow>
        <icosahedronGeometry args={[0.49 * scale, 0]} />
        <meshStandardMaterial color="#6f9381" flatShading />
      </mesh>
      <mesh position={[0.27 * scale, 0.86 * scale, 0.05]} castShadow>
        <icosahedronGeometry args={[0.31 * scale, 0]} />
        <meshStandardMaterial color="#7f9d86" flatShading />
      </mesh>
    </group>
  );
}

function PersonModel({ color, selected = false, uncertain = false }: { color: string; selected?: boolean; uncertain?: boolean }) {
  const opacity = uncertain ? 0.38 : 1;
  return (
    <group>
      <mesh position={[0, 0.39, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.17, 0.62, 8]} />
        <meshStandardMaterial color={color} transparent={uncertain} opacity={opacity} />
      </mesh>
      <mesh position={[0, 0.79, 0]} castShadow>
        <sphereGeometry args={[0.15, 12, 8]} />
        <meshStandardMaterial color="#d7aa86" transparent={uncertain} opacity={opacity} />
      </mesh>
      <mesh position={[-0.1, 0.08, 0]} rotation={[0, 0, 0.12]} castShadow>
        <cylinderGeometry args={[0.055, 0.06, 0.26, 7]} />
        <meshStandardMaterial color="#554f4a" transparent={uncertain} opacity={opacity} />
      </mesh>
      <mesh position={[0.1, 0.08, 0]} rotation={[0, 0, -0.12]} castShadow>
        <cylinderGeometry args={[0.055, 0.06, 0.26, 7]} />
        <meshStandardMaterial color="#554f4a" transparent={uncertain} opacity={opacity} />
      </mesh>
      {selected && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
        <ringGeometry args={[0.27, 0.34, 32]} />
        <meshBasicMaterial color="#f6d583" side={THREE.DoubleSide} />
      </mesh>}
    </group>
  );
}

function RouteLine({ points, color, opacity = 1, dashed = false }: { points: Point[]; color: string; opacity?: number; dashed?: boolean }) {
  const line = useMemo(() => {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map(([x, z]) => new THREE.Vector3(x, 0.13, z)));
    const material = dashed
      ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.25, gapSize: 0.16 })
      : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    const rendered = new THREE.Line(geometry, material);
    rendered.computeLineDistances();
    return rendered;
  }, [points, color, opacity, dashed]);
  useEffect(() => () => {
    line.geometry.dispose();
    (line.material as THREE.Material).dispose();
  }, [line]);
  return <primitive object={line} />;
}

function VanModel({ ghost = false }: { ghost?: boolean }) {
  const opacity = ghost ? 0.38 : 1;
  return (
    <group>
      <Box position={[0, 0.19, 0]} args={[0.68, 0.29, 0.4]} color="#c97656" transparent={ghost} opacity={opacity} />
      <Box position={[-0.08, 0.43, 0]} args={[0.34, 0.2, 0.38]} color="#f5e6c9" transparent={ghost} opacity={opacity} />
      <Box position={[0.25, 0.41, 0]} args={[0.2, 0.17, 0.36]} color="#d9e0d4" transparent={ghost} opacity={opacity} />
      {[-0.22, 0.22].map(x => (
        <mesh key={x} position={[x, 0.07, 0.21]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.09, 0.09, 0.05, 12]} />
          <meshStandardMaterial color="#444d4e" transparent={ghost} opacity={opacity} />
        </mesh>
      ))}
    </group>
  );
}

function Crate({ color }: { color: string }) {
  return (
    <group>
      <Box position={[-0.12, 0.15, 0]} args={[0.3, 0.25, 0.26]} color="#b98c62" />
      <Box position={[0.16, 0.15, 0]} args={[0.28, 0.25, 0.26]} color="#c69b6e" />
      <mesh position={[0, 0.33, 0]}>
        <dodecahedronGeometry args={[0.16, 0]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0.2, 0.32, 0.04]}>
        <dodecahedronGeometry args={[0.12, 0]} />
        <meshStandardMaterial color="#e8c7a1" />
      </mesh>
    </group>
  );
}

function FloralArrangement({ position, onClick }: { position: Point; onClick: () => void }) {
  return (
    <group position={[position[0], 0, position[1]]} onClick={onClick}>
      <Box position={[0, 0.18, 0]} args={[0.56, 0.35, 0.42]} color="#c49b70" />
      {[
        [-0.18, 0.57, 0],
        [0.02, 0.64, 0.06],
        [0.21, 0.54, -0.02],
        [-0.07, 0.5, -0.13],
      ].map(([x, y, z], index) => (
        <mesh key={index} position={[x, y, z]}>
          <dodecahedronGeometry args={[0.18, 0]} />
          <meshStandardMaterial color={index % 2 ? "#e5bd8e" : "#d9979e"} />
        </mesh>
      ))}
    </group>
  );
}

function TravelingEntity({ world, result, entityId, timeRef, kind, selected, visibleInMoment, onSelect }: {
  world: World;
  result: Simulation;
  entityId: string;
  timeRef: TimeRef;
  kind: "person" | "vehicle" | "crate";
  selected: boolean;
  visibleInMoment: boolean;
  onSelect: () => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const ferryDeck = useRef<THREE.Group>(null);
  const entity = world.entities.find(item => item.id === entityId);
  useFrame(() => {
    if (!ref.current) return;
    const sample: PositionSample = sampleEntity(world, result, entityId, timeRef.current);
    if (ferryDeck.current) ferryDeck.current.visible = sample.role === "ferry";
    if (!visibleInMoment || !sample.position || sample.status === "unknown") {
      ref.current.visible = false;
      return;
    }
    ref.current.visible = true;
    ref.current.position.set(sample.position[0], 0, sample.position[1]);
  });
  if (!entity) return null;
  return (
    <group ref={ref} onClick={onSelect} name={entity.name}>
      {kind === "person" ? <PersonModel color={entity.visual.color} selected={selected} /> : kind === "vehicle" ? <>
        <group ref={ferryDeck}>
          <Box position={[0, 0.06, 0]} args={[1.12, 0.12, 0.72]} color="#776c5a" />
          <Box position={[-0.46, 0.02, 0]} args={[0.12, 0.2, 0.8]} color="#9a8770" />
          <Box position={[0.46, 0.02, 0]} args={[0.12, 0.2, 0.8]} color="#9a8770" />
        </group>
        <VanModel />
      </> : <group position={[0, 0, 0.46]}><Crate color={entity.visual.color} /></group>}
    </group>
  );
}

function StaticPerson({ entity, position, selected, onSelect, uncertain = false }: {
  entity: World["entities"][number];
  position: Point;
  selected: boolean;
  onSelect: () => void;
  uncertain?: boolean;
}) {
  return <group position={[position[0], 0, position[1]]} onClick={onSelect} name={entity.name}>
    <PersonModel color={entity.visual.color} selected={selected} uncertain={uncertain} />
    {uncertain && <group position={[0, 1.13, 0]}>
      <mesh position={[0, 0.08, 0]}>
        <torusGeometry args={[0.09, 0.025, 6, 16, Math.PI * 1.6]} />
        <meshBasicMaterial color={palette.gold} />
      </mesh>
      <mesh position={[0.035, -0.015, 0]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshBasicMaterial color={palette.gold} />
      </mesh>
    </group>}
  </group>;
}

function UncertainCrate({ position, onSelect }: { position: Point; onSelect: () => void }) {
  return <group position={[position[0], 0.08, position[1]]} onClick={onSelect} name="Uncertain flower location">
    <mesh>
      <octahedronGeometry args={[0.28, 0]} />
      <meshBasicMaterial color={palette.gold} wireframe transparent opacity={0.7} />
    </mesh>
    <mesh position={[0, 0.35, 0]}>
      <sphereGeometry args={[0.06, 8, 8]} />
      <meshBasicMaterial color={palette.gold} />
    </mesh>
  </group>;
}

function GhostVehicle({ world, simulation, entityId, time, visible }: { world: World; simulation: Simulation; entityId: string; time: number; visible: boolean }) {
  const sample = sampleEntity(world, simulation, entityId, time);
  if (!visible || !sample.position || sample.status === "unknown") return null;
  return <group position={[sample.position[0], 0.02, sample.position[1]]}><VanModel ghost /></group>;
}

function CameraRig({ world, frame, width, height }: { world: World; frame: boolean; width: number; height: number }) {
  const configuredKey = useRef("");
  const pose = useMemo(() => {
    const plazaId = world.presentation.roles.plazaPlaceId;
    const plaza = world.entities.find(entity => entity.id === plazaId)?.visual.position ?? [0, 0];
    const compositionPoints = [
      ...world.featuredMoment.composition.subjectPositions.map(item => item.position),
      ...world.featuredMoment.composition.propPositions.map(item => item.position),
    ];
    const localX = frame && compositionPoints.length ? compositionPoints.reduce((sum, point) => sum + point[0], 0) / compositionPoints.length : frame ? plaza[0] : 0;
    const localZ = frame && compositionPoints.length ? compositionPoints.reduce((sum, point) => sum + point[1], 0) / compositionPoints.length : frame ? plaza[1] : 0;
    const targetX = Math.cos(-0.12) * localX + Math.sin(-0.12) * localZ;
    const targetZ = -Math.sin(-0.12) * localX + Math.cos(-0.12) * localZ;
    const targetZoom = frame ? (width < 600 ? 60 : 148) : width < 600 ? 23 : width < 950 ? 40 : 58;
    const cameraX = frame ? 8 : 13;
    const cameraY = frame ? 18 : 15;
    const cameraZ = frame ? 12 : 18;
    const key = [world.baseRevision, frame, width, height, plazaId, ...compositionPoints.flat()].join(":");
    return { key, position: [targetX + cameraX, cameraY, targetZ + cameraZ] as [number, number, number], target: [targetX, frame ? 0.45 : 0, targetZ] as [number, number, number], zoom: targetZoom };
  }, [world, frame, width, height]);
  useFrame(({ camera }) => {
    if (configuredKey.current === pose.key || !(camera instanceof THREE.OrthographicCamera)) return;
    camera.position.set(...pose.position);
    camera.zoom = pose.zoom;
    camera.lookAt(...pose.target);
    camera.updateProjectionMatrix();
    configuredKey.current = pose.key;
  });
  return null;
}

function WorldScene(props: DioramaProps) {
  const { world, result, originalWorld, originalResult, time, timeRef, compare, preview, momentFrame, selected, onSelect } = props;
  const width = useThree(state => state.size.width);
  const height = useThree(state => state.size.height);
  const { roles } = world.presentation;
  const activeTime = momentFrame ? world.events.find(event => event.id === world.featuredMoment.eventId)!.at! : time;
  const delivery = result.events.find(event => event.id === roles.deliveryEventId);
  const originalDelivery = originalResult.events.find(event => event.id === originalWorld.presentation.roles.deliveryEventId);
  const featuredPlace = world.entities.find(entity => entity.id === world.featuredMoment.placeId);
  const plazaPosition = featuredPlace?.visual.position ?? [0, 0];
  const closureConnection = world.connections.find(connection => connection.id === world.visitorClosure.connectionId);
  const bridgeSegment = closureConnection?.segments?.find(segment => segment.role === "bridge");
  const bridgePath = bridgeSegment?.path ?? [];
  const bridgeCenter: Point = bridgePath.length ? bridgePath[Math.floor(bridgePath.length / 2)] : [0, -1];
  const arrangementPositions = world.featuredMoment.composition.propPositions;
  const flowerPosition = arrangementPositions.find(item => item.entityId === roles.floralEntityId)?.position ?? [plazaPosition[0], plazaPosition[1] + 0.7];
  const related = new Set<string>();
  const traceCauses = (eventId: string) => {
    if (related.has(eventId)) return;
    related.add(eventId);
    const eventResult = result.events.find(item => item.id === eventId);
    for (const cause of eventResult?.reasons.flatMap(reason => reason.causes) ?? []) {
      if (result.events.some(item => item.id === cause)) traceCauses(cause);
    }
  };
  if (selected && result.events.some(event => event.id === selected)) traceCauses(selected);

  return (
    <>
      <color attach="background" args={["#e8e4d9"]} />
      <ambientLight intensity={1.15} />
      <directionalLight position={[-4, 10, 6]} intensity={2.15} castShadow shadow-mapSize={[1024, 1024]} />
      <group rotation={[0, -0.12, 0]}>
        <Box position={[0, -0.22, 0]} args={[16, 0.35, 10]} color="#d8d0b8" />
        <Box position={[0, -0.025, 0]} args={[15.7, 0.08, 9.7]} color={palette.ground} />
        <Box position={[0, 0.02, 0.35]} args={[3, 0.055, 9.5]} color={palette.water} />
        <Box position={[-3.65, 0.045, -0.6]} args={[5.8, 0.05, 7.4]} color="#e9ddc2" />
        <Box position={[4.2, 0.045, -0.6]} args={[5.3, 0.05, 7.4]} color="#eaddc3" />
        {bridgeSegment && <>
          <Box position={[bridgeCenter[0], 0.16, bridgeCenter[1]]} args={[Math.max(1, bridgePath.length - 1) * 1.5, 0.24, 0.95]} color={activeTime >= (closureConnection?.windows[0].end ?? world.horizon) ? "#b9aca0" : "#b58969"} onClick={() => onSelect(world.visitorClosure.connectionId)} />
          <Box position={[bridgeCenter[0], 0.31, bridgeCenter[1] - 0.54]} args={[Math.max(1, bridgePath.length - 1) * 1.5, 0.08, 0.08]} color="#7d705e" />
          <Box position={[bridgeCenter[0], 0.31, bridgeCenter[1] + 0.54]} args={[Math.max(1, bridgePath.length - 1) * 1.5, 0.08, 0.08]} color="#7d705e" />
          {activeTime >= (closureConnection?.windows[0].end ?? world.horizon) && <group position={[bridgeCenter[0], 0.36, bridgeCenter[1]]} rotation={[0, Math.PI / 2, 0]} onClick={() => onSelect(world.visitorClosure.connectionId)}>
            <Box position={[0, 0.24, 0]} args={[0.12, 0.48, 0.8]} color="#bd654f" />
          </group>}
        </>}
        {world.entities.filter(entity => entity.kind === "place" && entity.visual.position && ![roles.plazaPlaceId, roles.pierPlaceId, roles.landingPlaceId].includes(entity.id))
          .map(entity => <Building key={entity.id} entity={entity} onClick={() => onSelect(entity.id)} />)}
        <Box position={[plazaPosition[0], 0.09, plazaPosition[1]]} args={[2.8, 0.07, 2.6]} color={featuredPlace?.visual.color ?? palette.cream} onClick={() => onSelect(world.featuredMoment.placeId)} />
        <mesh position={[plazaPosition[0], 0.18, plazaPosition[1]]}>
          <cylinderGeometry args={[0.3, 0.32, 0.18, 16]} />
          <meshStandardMaterial color="#b5b2a2" />
        </mesh>
        <mesh position={[plazaPosition[0], 0.42, plazaPosition[1]]}>
          <sphereGeometry args={[0.15, 12, 8]} />
          <meshStandardMaterial color="#aec7c2" />
        </mesh>
        {[roles.pierPlaceId, roles.landingPlaceId].map((placeId, index) => {
          const place = world.entities.find(entity => entity.id === placeId);
          if (!place?.visual.position) return null;
          const [x, z] = place.visual.position;
          return <group key={placeId} onClick={() => onSelect(placeId)}>
            <Box position={[x, 0.1, z]} args={[index ? 1.6 : 1.8, 0.1, 0.58]} color={place.visual.color} />
            {[-0.6, 0.6].map(offset => <Box key={offset} position={[x + offset, 0.22, z]} args={[0.1, 0.26, 0.1]} color="#7b654e" />)}
          </group>;
        })}
        {[-6.7, -3.7, 3.0, 6.8].map((x, index) => <Tree key={x} x={x} z={index % 2 ? 2.9 : -3} scale={index % 2 ? 0.82 : 1} />)}

        {world.entities.filter(entity => entity.kind === "person" && entity.id !== roles.courierEntityId).map(entity => {
          if (momentFrame && world.featuredMoment.subjectEntityIds.includes(entity.id)) {
            const presence = selectMomentEntityPresence(world, result, entity.id, activeTime);
            if (presence.kind === "absent") return null;
            const position = getMomentMarkerPosition(presence);
            if (!position) return null;
            return <StaticPerson key={entity.id} entity={entity} position={position} selected={selected === entity.id} uncertain={presence.kind === "uncertain"} onSelect={() => onSelect(entity.id)} />;
          }
          return <TravelingEntity key={entity.id} world={world} result={result} entityId={entity.id} timeRef={timeRef} kind="person" selected={selected === entity.id} visibleInMoment={!momentFrame} onSelect={() => onSelect(entity.id)} />;
        })}

        <TravelingEntity world={world} result={result} entityId={roles.courierEntityId} timeRef={momentFrame ? { current: activeTime } : timeRef} kind="person" selected={selected === roles.courierEntityId} visibleInMoment={!momentFrame} onSelect={() => onSelect(roles.courierEntityId)} />
        <TravelingEntity world={world} result={result} entityId={roles.vehicleEntityId} timeRef={momentFrame ? { current: activeTime } : timeRef} kind="vehicle" selected={selected === roles.vehicleEntityId} visibleInMoment={!momentFrame} onSelect={() => onSelect(roles.deliveryEventId)} />

        {isArrangementVisibleAt(world, result, activeTime, roles.floralEntityId)
          ? <FloralArrangement position={flowerPosition} onClick={() => onSelect(roles.setupEventId)} />
          : momentFrame
            ? (() => {
              const presence = selectMomentEntityPresence(world, result, roles.floralEntityId, activeTime);
              if (presence.kind === "absent") return null;
              if (presence.kind === "uncertain") return presence.position ? <UncertainCrate position={presence.position} onSelect={() => onSelect(roles.floralEntityId)} /> : null;
              return <group position={[presence.position[0], 0, presence.position[1]]} onClick={() => onSelect(roles.floralEntityId)} name="Flower crates"><Crate color={world.entities.find(entity => entity.id === roles.floralEntityId)?.visual.color ?? "#ce8c9b"} /></group>;
            })()
            : <TravelingEntity world={world} result={result} entityId={roles.floralEntityId} timeRef={timeRef} kind="crate" selected={selected === roles.floralEntityId} visibleInMoment onSelect={() => onSelect(roles.floralEntityId)} />}

        {!momentFrame && compare && originalDelivery?.route && <>
          <RouteLine points={originalDelivery.route.path} color={palette.seaInk} opacity={0.68} dashed />
          <GhostVehicle world={originalWorld} simulation={originalResult} entityId={originalWorld.presentation.roles.vehicleEntityId} time={activeTime} visible />
        </>}
        {!momentFrame && delivery?.route && related.has(roles.deliveryEventId) && <RouteLine points={delivery.route.path} color={preview ? palette.gold : palette.terracotta} opacity={0.92} dashed={preview} />}
        {bridgeSegment && <RouteLine points={bridgeSegment.path} color={activeTime >= (closureConnection?.windows[0].end ?? world.horizon) ? "#a15c4c" : "#80664e"} opacity={1} />}
      </group>
      <CameraRig world={world} frame={momentFrame} width={width} height={height} />
    </>
  );
}

export default function Diorama(props: DioramaProps) {
  return (
    <Canvas
      shadows
      orthographic
      camera={{ position: [13, 15, 18], zoom: 53, near: 0.1, far: 100 }}
      dpr={[1, 1.6]}
      gl={{ antialias: true, powerPreference: "low-power" }}
      onCreated={() => props.onSceneReady?.()}
      fallback={<div className="fallback"><h2>3D view unavailable</h2><p>The neighborhood cannot be rendered here. Its events and timeline remain available as a text summary.</p></div>}
    >
      <WorldScene {...props} />
    </Canvas>
  );
}
