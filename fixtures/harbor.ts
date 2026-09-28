import { validateWorld } from "../src/world/model";

const worldId = "butterfly-harbor";
const place = (id: string, name: string, position: [number, number], color = "#d8c6a8", prefab = "terrace") => ({ id, worldId, kind: "place" as const, name, visual: { kind: prefab, color, position } });
const person = (id: string, name: string, initialPlaceId: string, color: string, position:[number,number]) => ({ id, worldId, kind: "person" as const, name, initialPlaceId, visual: { kind: "person", color, position } });
export const sampleWorld = validateWorld({
  id: worldId, baseRevision: "sample-1", title: "The harbor afternoon", origin: "Fictional day", originMinute: 960, horizon: 120, networkComplete: true, closureEditableConnectionIds: ["bridge"],visitorClosure:{connectionId:"bridge",end:15},
  featuredMoment:{eventId:"photo",placeId:"plaza",arrangementEventId:"setup",photographerEntityId:"photographer",subjectEntityIds:["photographer","couple"],propEntityIds:["flowers"],composition:{photographerPosition:[3.5,1.45],subjectPositions:[{entityId:"photographer",position:[3.5,1.45]},{entityId:"couple",position:[4.8,1.55]}],propPositions:[{entityId:"flowers",position:[4.1,1.85]}]}},
  presentation:{eventOrder:["delivery","setup","photo","ceremony"],roles:{deliveryEventId:"delivery",setupEventId:"setup",ceremonyEventId:"ceremony",courierEntityId:"courier",vehicleEntityId:"delivery-van",floralEntityId:"flowers",depotPlaceId:"depot",plazaPlaceId:"plaza",pierPlaceId:"pier",landingPlaceId:"east-landing",storyArtifactId:"gazette"}},
  entities: [
    place("depot", "Flower depot", [-5, -1],"#d4a078","warehouse"), place("plaza", "Sunlit plaza", [4, 1],"#f0e3ca","plaza"), place("pier", "Ferry pier", [-2.7, 2.5],"#9a8770","pier"), place("east-landing","East-bank landing",[2.5,2.5],"#a98e6e","landing"),place("bakery","Bakery",[-5.5,1.4],"#c9b7a0","shop"),place("townhall","Town hall",[4.7,-2.3],"#d8b68d","civic"),place("gazette-site","Gazette office",[6.8,-3.8],"#ddd0b2","office"),
    person("courier", "Mara, the courier", "depot", "#d27a50",[-5,-1]), person("photographer", "Elio, the photographer", "plaza", "#467d77",[3.5,1.45]), person("couple", "The couple", "plaza", "#a85f6d",[4.8,1.55]),
    { id: "flowers", worldId, kind: "object", name: "Flower crates", initialPlaceId: "depot", visual: { kind: "flowers", color: "#ce8c9b", position: [-5,-1] } },
    { id: "delivery-van", worldId, kind: "object", name: "Delivery van", initialPlaceId: "depot", visual: { kind: "vehicle", color: "#c97656", position: [-5,-1] } }
  ],
  connections: [
    { id: "bridge", worldId, label:"River bridge", from: "depot", to: "plaza", modes: ["van"], duration: 10, windows: [{ start: 0, end: 120 }], enabled: true, path: [[-5,-1],[-1.5,-1],[1.5,-1],[4,1]], segments:[{role:"road",duration:3,path:[[-5,-1],[-1.5,-1]]},{role:"bridge",duration:4,path:[[-1.5,-1],[0,-1],[1.5,-1]]},{role:"road",duration:3,path:[[1.5,-1],[4,1]]}] },
    { id: "land", worldId, label:"Overland road", from: "depot", to: "plaza", modes: ["van"], duration: 35, windows: [{ start: 0, end: 120 }], enabled: true, path: [[-5,-1],[-6,-4.5],[0,-4.6],[6,-4.5],[4,1]] },
    { id: "land-to-pier", worldId, label:"Approach road", from: "depot", to: "pier", modes: ["van"], duration: 5, windows: [{ start: 0, end: 120 }], enabled: true, path: [[-5,-1],[-3.8,0.4],[-2.7,2.5]], segments:[{role:"road",duration:5,path:[[-5,-1],[-3.8,0.4],[-2.7,2.5]]}] },
    { id: "ferry", worldId, label:"ferry", from: "pier", to: "east-landing", modes: ["van"], duration: 7, windows: [{ start: 30, end: 120 }], enabled: false, path: [[-2.7,2.5],[-1,2.5],[0.8,2.5],[2.5,2.5]], segments:[{role:"ferry",duration:7,path:[[-2.7,2.5],[-1,2.5],[0.8,2.5],[2.5,2.5]]}] },
    { id: "landing-road", worldId, label:"Landing road", from: "east-landing", to: "plaza", modes: ["van"], duration: 3, windows: [{ start: 0, end: 120 }], enabled: true, path: [[2.5,2.5],[3.3,1.8],[4,1]], segments:[{role:"road",duration:3,path:[[2.5,2.5],[3.3,1.8],[4,1]]}] }
  ],
  facts: [{ id: "cargo-ready", worldId, key: "cargoAvailable", value: true, interval: { start: 0, end: 120 }, source: "input" }, { id: "courier-ready", worldId, key: "courierAvailable", value: true, interval: { start: 0, end: 120 }, source: "input" }],
  events: [
    { id: "delivery", worldId, kind: "transport", name: "Flower delivery", at: 20, requirements: [{ type: "factEquals", key: "cargoAvailable", value: true }, { type: "factEquals", key: "courierAvailable", value: true }, { type: "entityAt", entityId: "courier", placeId: "depot" }, { type: "entityAt", entityId: "flowers", placeId: "depot" }, { type: "entityAt", entityId: "delivery-van", placeId: "depot" }], actorIds: ["courier", "flowers","delivery-van"], from: "depot", to: "plaza", mode: "van", effects: [{ key: "flowersDelivered", value: true }] },
    { id: "setup", worldId, kind: "dependent", name: "Floral setup", afterEventId: "delivery", delay: 10, requirements: [{ type: "eventOccurred", eventId: "delivery" }, { type: "entityAt", entityId: "flowers", placeId: "plaza" }], actorIds: ["flowers"], effects: [{ key: "setupReady", value: true }] },
    { id: "photo", worldId, kind: "fixed", name: "The photograph", at: 50, requirements: [{ type: "eventOccurred", eventId: "setup" }, { type: "entityAt", entityId: "photographer", placeId: "plaza" }, { type: "entityAt", entityId: "couple", placeId: "plaza" }, { type: "entityAt", entityId: "flowers", placeId: "plaza" }, { type: "factEquals", key: "setupReady", value: true }], actorIds: ["photographer", "couple","flowers"], effects: [{ key: "photographTaken", value: true }] },
    { id: "ceremony", worldId, kind: "fixed", name: "The ceremony", at: 75, requirements: [{ type: "entityAt", entityId: "photographer", placeId: "plaza" }, { type: "entityAt", entityId: "couple", placeId: "plaza" }], actorIds: ["photographer", "couple"], effects: [{ key: "ceremonyHeld", value: true }] }
  ],
  artifacts: [{ id: "gazette", worldId, title: "Harbor Gazette", body: "At 16:50, the couple posed beside fresh flowers in the plaza.", claims: [{ eventId: "photo", occurred: true }] }],
  interventions: [
    { type: "setEventTime", eventId: "delivery", values: [0, 10, 20], precondition: { minAvailableAt: 0 } },
    { type: "enableConnection", connectionId: "ferry", values: [true], precondition: { requiredMode: "van" } }
  ]
});
