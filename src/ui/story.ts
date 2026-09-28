import type { Operation, World } from "../world/model";
import { formatTime, getEvent, type Simulation } from "../engine/simulate";

const clock = (world: World, minute: number | null) => formatTime(minute, world.originMinute);
const name = (value: string) => value.charAt(0).toLowerCase() + value.slice(1);

export function explainDay(world: World, result: Simulation): string {
  const { roles } = world.presentation;
  const delivery = getEvent(result, roles.deliveryEventId);
  const setup = getEvent(result, roles.setupEventId);
  const moment = getEvent(result, world.featuredMoment.eventId);
  const route = delivery.route?.connectionIds.map(id => world.connections.find(connection => connection.id === id)?.label ?? id).join(" → ");
  const closure = world.connections.find(connection => connection.id === world.visitorClosure.connectionId);
  const closureTime = closure?.windows[0]?.end;
  if (moment.status === "unknown") return `The available world data cannot establish whether ${name(moment.name)} can happen at ${clock(world, moment.time)}.`;
  if (delivery.time === null || setup.time === null) return `${name(moment.name)} is ${moment.status} at ${clock(world, moment.time)}. Inspect its requirements to see which condition is missing.`;
  const crossing = closure && closureTime !== undefined ? `${closure.label ?? closure.id} closes at ${clock(world, closureTime)}. ` : "";
  const journey = route ? `The courier takes ${route}; ` : "";
  const timing = `${name(delivery.name)} finishes at ${clock(world, delivery.time)} and ${name(setup.name)} at ${clock(world, setup.time)}.`;
  if (moment.status === "impossible" && setup.time > (moment.time ?? world.horizon)) return `${crossing}${route ? `Via ${route}: ` : ""}${delivery.name} ${clock(world, delivery.time)}, ${setup.name} ${clock(world, setup.time)}. The chosen ${clock(world, moment.time)} composition is missed.`;
  if (moment.status === "possible") return `${journey}${timing} The chosen composition remains possible at ${clock(world, moment.time)}.`;
  return `${crossing}${journey}${timing} Inspect the remaining requirements for ${name(moment.name)}.`;
}

export function explainIntervention(world: World, result: Simulation, operations: Operation[]): string {
  const delivery = getEvent(result, world.presentation.roles.deliveryEventId);
  const setup = getEvent(result, world.presentation.roles.setupEventId);
  const route = delivery.route?.connectionIds.map(id => world.connections.find(connection => connection.id === id)?.label ?? id).join(" → ");
  const wait = delivery.route?.itinerary.find(step => step.kind === "wait");
  const departure = operations.find((operation): operation is Extract<Operation, { type: "setEventTime" }> => operation.type === "setEventTime");
  const action = departure ? `Departure moves to ${clock(world, departure.value)}. ` : `Departure stays at ${clock(world, delivery.route?.plannedDepart ?? null)}. `;
  const waiting = wait?.kind === "wait" ? `The courier waits at ${world.entities.find(entity => entity.id === wait.placeId)?.name ?? wait.placeId} until ${clock(world, wait.end)}. ` : "";
  return `${action}${route ? `The route uses ${route}. ` : ""}${waiting}${name(delivery.name)} finishes at ${clock(world, delivery.time)}; ${name(setup.name)} is ready at ${clock(world, setup.time)}. The bridge closure stays in place.`;
}
