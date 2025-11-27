/// <reference lib="webworker" />

import { Station, TrainTrip, RouteStep, ChallengeResult } from './models/gtfs.types';

addEventListener('message', async ({ data }) => {
  const { command, startTime } = data;

  if (command === 'SOLVE') {
    try {
      // 1. Load Data (if not loaded)
      const { stations, trips, transfers } = await loadGtfsData();

      // 2. Build Graph & Complexes
      const complexMap = buildComplexes(stations, transfers);
      const schedule = buildSchedule(trips);

      // 3. Run Solver
      const result = solve(stations, schedule, complexMap, startTime);

      postMessage({ type: 'RESULT', payload: result });
    } catch (err) {
      postMessage({ type: 'ERROR', payload: err });
    }
  }
});

// Cache data in worker
let cachedStations: Station[] | null = null;
let cachedTrips: TrainTrip[] | null = null;
let cachedTransfers: Transfer[] | null = null;

interface Transfer {
  fromStopId: string;
  toStopId: string;
  type: number;
}

async function loadGtfsData() {
  if (cachedStations && cachedTrips && cachedTransfers) {
    return { stations: cachedStations, trips: cachedTrips, transfers: cachedTransfers };
  }

  const baseUrl = '/assets/data/gtfs';

  const [stopsRes, tripsRes, stopTimesRes, transfersRes] = await Promise.all([
    fetch(`${baseUrl}/stops.txt`),
    fetch(`${baseUrl}/trips.txt`),
    fetch(`${baseUrl}/stop_times.txt`),
    fetch(`${baseUrl}/transfers.txt`)
  ]);

  const stopsText = await stopsRes.text();
  const tripsText = await tripsRes.text();
  const stopTimesText = await stopTimesRes.text();
  const transfersText = await transfersRes.text();

  cachedStations = parseStations(stopsText);
  cachedTrips = parseSchedule(tripsText, stopTimesText);
  cachedTransfers = parseTransfers(transfersText);

  return { stations: cachedStations, trips: cachedTrips, transfers: cachedTransfers };
}

// --- Parsing Logic ---

function parseStations(csv: string): Station[] {
  const lines = csv.split('\n');
  const stations: Station[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const row = line.split(',');

    const stopId = row[0];
    const parentId = row[5] || stopId;

    const station: Station = {
      id: stopId,
      name: row[1],
      lat: parseFloat(row[2]),
      lon: parseFloat(row[3]),
      line: [],
      isComplex: false,
      parentId: parentId
    };

    if (station.name && !isNaN(station.lat)) {
      stations.push(station);
    }
  }
  return stations;
}

function parseSchedule(tripsCsv: string, stopTimesCsv: string): TrainTrip[] {
  const tripsLines = tripsCsv.split('\n');
  const stopTimesLines = stopTimesCsv.split('\n');
  const tripsMap = new Map<string, TrainTrip>();

  for (let i = 1; i < tripsLines.length; i++) {
    const line = tripsLines[i].trim();
    if (!line) continue;
    const row = line.split(',');

    tripsMap.set(row[1], {
      routeId: row[0],
      tripId: row[1],
      serviceId: row[2],
      stopTimes: []
    });
  }

  for (let i = 1; i < stopTimesLines.length; i++) {
    const line = stopTimesLines[i].trim();
    if (!line) continue;
    const row = line.split(',');

    const tripId = row[0];
    const trip = tripsMap.get(tripId);

    if (trip) {
      trip.stopTimes.push({
        stationId: row[1],
        arrivalTime: timeToSeconds(row[2]),
        departureTime: timeToSeconds(row[3])
      });
    }
  }

  return Array.from(tripsMap.values());
}

function parseTransfers(csv: string): Transfer[] {
  const lines = csv.split('\n');
  const transfers: Transfer[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const row = line.split(',');

    transfers.push({
      fromStopId: row[0],
      toStopId: row[1],
      type: parseInt(row[2] || '0', 10)
    });
  }
  return transfers;
}

function timeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const s = parseInt(parts[2], 10);
  return h * 3600 + m * 60 + s;
}

// --- Complex Grouping (Union-Find) ---

function buildComplexes(stations: Station[], transfers: Transfer[]): Map<string, string> {
  const parent = new Map<string, string>();

  function find(i: string): string {
    if (parent.get(i) === i) return i;
    const root = find(parent.get(i)!);
    parent.set(i, root);
    return root;
  }

  function union(i: string, j: string) {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) {
      parent.set(rootI, rootJ);
    }
  }

  // Initialize
  stations.forEach(s => parent.set(s.id, s.id));

  // Union parents and children
  stations.forEach(s => {
    if (s.parentId && s.parentId !== s.id) {
      // Ensure parent exists in map (it should if loaded)
      if (!parent.has(s.parentId)) parent.set(s.parentId, s.parentId);
      union(s.id, s.parentId);
    }
  });

  // Union transfers
  transfers.forEach(t => {
    if (parent.has(t.fromStopId) && parent.has(t.toStopId)) {
      union(t.fromStopId, t.toStopId);
    }
  });

  // Build result map: stopId -> complexId
  const complexMap = new Map<string, string>();
  stations.forEach(s => {
    complexMap.set(s.id, find(s.id));
  });

  return complexMap;
}

// --- Solver Logic ---

interface Departure {
  tripId: string;
  routeId: string;
  departureTime: number;
  nextStationId: string;
  arrivalTimeAtNext: number;
}

function buildSchedule(trips: TrainTrip[]): Map<string, Departure[]> {
  const schedule = new Map<string, Departure[]>();

  trips.forEach(trip => {
    for (let i = 0; i < trip.stopTimes.length - 1; i++) {
      const current = trip.stopTimes[i];
      const next = trip.stopTimes[i + 1];

      if (!schedule.has(current.stationId)) {
        schedule.set(current.stationId, []);
      }

      schedule.get(current.stationId)!.push({
        tripId: trip.tripId,
        routeId: trip.routeId,
        departureTime: current.departureTime,
        nextStationId: next.stationId,
        arrivalTimeAtNext: next.arrivalTime
      });
    }
  });

  schedule.forEach(departures => {
    departures.sort((a, b) => a.departureTime - b.departureTime);
  });

  return schedule;
}

function solve(
  stations: Station[],
  schedule: Map<string, Departure[]>,
  complexMap: Map<string, string>,
  startTime: number
): ChallengeResult {

  const allComplexIds = new Set(complexMap.values());
  const visitedComplexes = new Set<string>();
  const itinerary: RouteStep[] = [];

  // Tabu list to prevent loops: list of recently visited complex IDs
  const tabuList: string[] = [];
  const TABU_SIZE = 10;

  if (!stations || stations.length === 0) throw new Error('No stations loaded');
  const scheduledStations = Array.from(schedule.keys());
  if (scheduledStations.length === 0) throw new Error('No scheduled trips found');

  const startStationId = scheduledStations[0];
  let currentStationId = startStationId;
  let currentTime = startTime;

  const startComplex = complexMap.get(currentStationId)!;
  // VISITED LOGIC: Start station is "visited" by definition of starting there?
  // User wants: "It only counts as visiting if you WALK to a station THEN get on a train."
  // But for the START station, we are already there. Let's count it.
  visitedComplexes.add(startComplex);
  tabuList.push(startComplex);
  console.log(`Started at ${currentStationId} (Complex ${startComplex}). Visited count: ${visitedComplexes.size}`);

  let steps = 0;
  const MAX_STEPS = 3000;
  let lastRouteId: string | null = null;

  // Pre-compute siblings for fast transfer lookups
  const siblingsMap = new Map<string, Station[]>();
  stations.forEach(s => {
    const cId = complexMap.get(s.id)!;
    if (!siblingsMap.has(cId)) {
      siblingsMap.set(cId, []);
    }
    siblingsMap.get(cId)!.push(s);
  });

  let lastStepType: 'RIDE' | 'WALK' | 'TRANSFER' | 'WAIT' | null = null;
  let lastWalkStep = -100; // Initialize far back so we can walk immediately if needed

  // Track progress
  let stepsSinceLastVisit = 0;

  while (visitedComplexes.size < allComplexIds.size && steps < MAX_STEPS) {
    steps++;

    const bestMove = findBestMove(
      currentStationId,
      currentTime,
      visitedComplexes,
      schedule,
      complexMap,
      stations,
      tabuList,
      lastRouteId,
      siblingsMap,
      lastStepType,
      lastWalkStep,
      steps,
      stepsSinceLastVisit
    );

    // Update stuck counter
    let nextComplex = complexMap.get(bestMove?.departure.nextStationId || '')!;
    if (bestMove && !visitedComplexes.has(nextComplex)) {
      stepsSinceLastVisit = 0;
    } else {
      stepsSinceLastVisit++;
    }

    if (!bestMove) {
      console.log(`[STOP] Solver stopped at Step ${steps}. No valid moves found from ${currentStationId} at ${formatDuration(currentTime - startTime)}.`);
      // Check if it's a dead end
      const deps = schedule.get(currentStationId);
      if (!deps || deps.length === 0) {
        console.log(`[STOP] Reason: Dead End (No departures in schedule for ${currentStationId}).`);
      } else {
        const validDeps = deps.filter(d => d.departureTime >= currentTime);
        console.log(`[STOP] Station ${currentStationId} has ${deps.length} total departures.`);
        console.log(`[STOP] First departure: ${formatDuration(deps[0].departureTime)}. Last departure: ${formatDuration(deps[deps.length - 1].departureTime)}.`);

        if (validDeps.length === 0) {
          console.log(`[STOP] Reason: No departures after current time (${formatDuration(currentTime)}). Circular schedule logic failed?`);
          // Log the last few departures to see how close we were
          const lastFew = deps.slice(-5);
          console.log(`[STOP] Last 5 departures: ${lastFew.map(d => formatDuration(d.departureTime)).join(', ')}`);
        } else {
          console.log(`[STOP] Reason: All ${validDeps.length} valid moves were rejected (likely Must Ride rule with no valid Train moves).`);
          // Log the scores of the valid moves
          validDeps.slice(0, 5).forEach(d => {
            console.log(`[STOP] Candidate: ${d.routeId} to ${d.nextStationId}.`);
          });
        }
      }
      break;
    }

    // Update Tabu List
    nextComplex = complexMap.get(bestMove.departure.nextStationId)!;
    tabuList.push(nextComplex);
    if (tabuList.length > 20) {
      tabuList.shift();
    }

    // DEBUG LOGGING
    if (steps % 10 === 0 || bestMove.score < 0) {
      console.log(`Step ${steps}: ${bestMove.departure.routeId} to ${bestMove.departure.nextStationId} (${nextComplex}). Score: ${bestMove.score.toFixed(0)}. Visited: ${visitedComplexes.size}/${allComplexIds.size}`);
    }

    if (bestMove.departure.departureTime > currentTime) {
      itinerary.push({
        stepType: 'WAIT',
        fromStation: currentStationId,
        toStation: currentStationId,
        startTime: currentTime,
        endTime: bestMove.departure.departureTime,
        stationsCovered: [],
        description: `Wait for ${bestMove.departure.routeId} train`
      });
    }

    const nextStationId = bestMove.departure.nextStationId;
    let stepType: 'RIDE' | 'WALK' | 'TRANSFER' = 'RIDE';

    if (bestMove.departure.tripId === 'WALK') {
      stepType = 'WALK';
      lastWalkStep = steps;
    }
    else if (bestMove.departure.tripId === 'TRANSFER') stepType = 'TRANSFER';

    itinerary.push({
      stepType: stepType,
      fromStation: currentStationId,
      toStation: nextStationId,
      routeId: bestMove.departure.routeId,
      startTime: bestMove.departure.departureTime,
      endTime: bestMove.departure.arrivalTimeAtNext,
      stationsCovered: [nextStationId],
      description: `${stepType} to ${bestMove.departure.nextStationId}`
    });

    currentTime = bestMove.departure.arrivalTimeAtNext;

    // VISITED LOGIC:
    if (stepType === 'RIDE') {
      const currentComplex = complexMap.get(currentStationId)!;
      visitedComplexes.add(currentComplex);
      visitedComplexes.add(nextComplex);
    }

    currentStationId = nextStationId;
    lastRouteId = bestMove.departure.routeId;

    // DEBUG: Log step type update
    if (stepType !== 'RIDE') {
      console.log(`[DEBUG] Step ${steps}: Type=${stepType}. Setting lastStepType to ${stepType}`);
    }
    lastStepType = stepType;
  }

  // Expand visited complexes to all station IDs for the UI
  const allVisitedStationIds = new Set<string>();
  stations.forEach(s => {
    const cId = complexMap.get(s.id);
    if (cId && visitedComplexes.has(cId)) {
      allVisitedStationIds.add(s.id);
    }
  });

  return {
    totalTime: formatDuration(currentTime - startTime),
    stationsVisitedCount: visitedComplexes.size,
    visitedStationIds: allVisitedStationIds,
    itinerary,
    startTime: new Date(startTime * 1000).toISOString(),
    startStationId
  };
}

function findBestMove(
  currentStationId: string,
  currentTime: number,
  visitedComplexes: Set<string>,
  schedule: Map<string, Departure[]>,
  complexMap: Map<string, string>,
  stations: Station[],
  tabuList: string[],
  lastRouteId: string | null,
  siblingsMap: Map<string, Station[]>,
  lastStepType: 'RIDE' | 'WALK' | 'TRANSFER' | 'WAIT' | null,
  lastWalkStep: number,
  steps: number,
  stepsSinceLastVisit: number
): { departure: Departure, score: number } | null {

  // STEP 1: Find the nearest unvisited station (our target)
  const currentStation = stations.find(s => s.id === currentStationId)!;
  let nearestUnvisitedStation: Station | null = null;
  let minDistToUnvisited = Infinity;

  for (const s of stations) {
    const cId = complexMap.get(s.id)!;
    if (!visitedComplexes.has(cId)) {
      const dx = s.lon - currentStation.lon;
      const dy = s.lat - currentStation.lat;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDistToUnvisited) {
        minDistToUnvisited = dist;
        nearestUnvisitedStation = s;
      }
    }
  }

  if (!nearestUnvisitedStation) {
    // All stations visited!
    return null;
  }

  if (steps % 10 === 0) {
    console.log(`[TARGET] Nearest unvisited: ${nearestUnvisitedStation.name} (dist: ${minDistToUnvisited.toFixed(4)})`);
  }

  let bestMove: { departure: Departure, score: number } | null = null;
  let bestScore = -Infinity;

  // STEP 2: Evaluate all possible moves and pick the one that gets us closest to the target

  // Must Ride rule (simplified: only applies if not stuck)
  const isStuck = stepsSinceLastVisit > 30;
  const mustRide = (lastStepType === 'WALK' || lastStepType === 'TRANSFER') && !isStuck;

  // Option A: Take a train from current station
  const departures = schedule.get(currentStationId);
  if (departures) {
    // Use circular schedule logic
    let validDepartures: { dep: Departure, effectiveTime: number }[] = [];
    const todayDepartures = departures.filter(d => d.departureTime >= currentTime);
    if (todayDepartures.length > 0) {
      validDepartures = todayDepartures.map(d => ({ dep: d, effectiveTime: d.departureTime }));
    } else {
      validDepartures = departures.slice(0, 10).map(d => ({
        dep: d,
        effectiveTime: getEffectiveDepartureTime(d.departureTime, currentTime)
      }));
    }

    for (const { dep, effectiveTime } of validDepartures) {
      const nextStation = stations.find(s => s.id === dep.nextStationId)!;
      const dx = nextStation.lon - nearestUnvisitedStation.lon;
      const dy = nextStation.lat - nearestUnvisitedStation.lat;
      const distToTarget = Math.sqrt(dx * dx + dy * dy);

      // Score = how much closer we get to the target (negative distance is good)
      let score = (minDistToUnvisited - distToTarget) * 100000;

      // Small bonus for staying on same line
      if (lastRouteId && dep.routeId === lastRouteId) {
        score += 100;
      }

      // Penalize time cost (but much less than distance)
      score -= (effectiveTime - currentTime) / 100;

      if (score > bestScore) {
        bestScore = score;
        const effectiveDeparture: Departure = {
          ...dep,
          departureTime: effectiveTime,
          arrivalTimeAtNext: effectiveTime + (dep.arrivalTimeAtNext - dep.departureTime)
        };
        bestMove = { departure: effectiveDeparture, score };
      }
    }
  }

  if (mustRide) {
    return bestMove; // Can't transfer or walk
  }

  // Option B: Transfer to sibling platform
  const currentComplexId = complexMap.get(currentStationId)!;
  const siblings = siblingsMap.get(currentComplexId) || [];

  for (const sibling of siblings) {
    if (sibling.id === currentStationId) continue;

    const siblingDepartures = schedule.get(sibling.id);
    if (!siblingDepartures) continue;

    // Check if sibling has trains that get us closer
    const transferReadyTime = currentTime + 120;
    let catchableDepartures: Departure[] = [];
    const todayDeps = siblingDepartures.filter(d => d.departureTime >= transferReadyTime);
    if (todayDeps.length > 0) {
      catchableDepartures = todayDeps;
    } else {
      catchableDepartures = siblingDepartures.slice(0, 10);
    }

    // Find the best train from this sibling
    let bestSiblingScore = -Infinity;
    for (const dep of catchableDepartures) {
      const nextStation = stations.find(s => s.id === dep.nextStationId)!;
      const dx = nextStation.lon - nearestUnvisitedStation.lon;
      const dy = nextStation.lat - nearestUnvisitedStation.lat;
      const distToTarget = Math.sqrt(dx * dx + dy * dy);
      const improvement = (minDistToUnvisited - distToTarget) * 100000;
      if (improvement > bestSiblingScore) {
        bestSiblingScore = improvement;
      }
    }

    // Score the transfer
    let score = bestSiblingScore - 120; // Subtract transfer time

    if (score > bestScore) {
      bestScore = score;
      const transferDeparture: Departure = {
        tripId: 'TRANSFER',
        routeId: 'TRANSFER',
        departureTime: currentTime,
        nextStationId: sibling.id,
        arrivalTimeAtNext: currentTime + 120
      };
      bestMove = { departure: transferDeparture, score };
    }
  }

  // Option C: Walk to a nearby station
  const WALK_COOLDOWN = isStuck ? 0 : 5; // Remove cooldown if stuck
  const stepsSinceLastWalk = steps - lastWalkStep;
  const canWalk = stepsSinceLastWalk >= WALK_COOLDOWN;

  if (canWalk) {
    const maxWalkDist = isStuck ? Infinity : 0.02; // Remove distance limit if stuck

    for (const s of stations) {
      if (s.id === currentStationId) continue;

      const targetComplexId = complexMap.get(s.id)!;
      const currentComplexId = complexMap.get(currentStationId)!;
      if (targetComplexId === currentComplexId) continue;

      const sched = schedule.get(s.id);
      if (!sched || sched.length === 0) continue;

      const dx = s.lon - currentStation.lon;
      const dy = s.lat - currentStation.lat;
      const walkDist = Math.sqrt(dx * dx + dy * dy);

      if (walkDist > maxWalkDist) continue;

      // Calculate distance from walk target to our goal
      const dx2 = s.lon - nearestUnvisitedStation.lon;
      const dy2 = s.lat - nearestUnvisitedStation.lat;
      const distToTarget = Math.sqrt(dx2 * dx2 + dy2 * dy2);

      // Score = how much closer we get
      let score = (minDistToUnvisited - distToTarget) * 100000;

      // Penalize walk distance
      score -= walkDist * 10000;

      if (score > bestScore) {
        bestScore = score;
        const distMeters = walkDist * 100000;
        const walkSeconds = Math.ceil(distMeters / 1.4);
        const arrivalTime = currentTime + walkSeconds;

        const walkDeparture: Departure = {
          tripId: 'WALK',
          routeId: 'WALK',
          departureTime: currentTime,
          nextStationId: s.id,
          arrivalTimeAtNext: arrivalTime
        };
        bestMove = { departure: walkDeparture, score };
      }
    }
  }

  return bestMove;
}

function getBestTrainScore(
  stationId: string,
  time: number,
  visitedComplexes: Set<string>,
  schedule: Map<string, Departure[]>,
  complexMap: Map<string, string>,
  tabuList: string[],
  lastRouteId: string | null
): number {
  const departures = schedule.get(stationId);
  if (!departures) return -Infinity;

  // CIRCULAR SCHEDULE LOGIC
  // We consider ALL departures. If a departure is earlier than 'time', we treat it as 'tomorrow' (add 24h).
  // We only care about the SOONEST ones, but since the list is sorted by time, we can iterate.
  // Actually, we should find the first departure >= time.
  // If we find one, that's the best candidate for "today".
  // If we don't, we wrap around to the start of the list and add 24h.

  let validDepartures: { dep: Departure, effectiveTime: number }[] = [];

  // 1. Try to find departures later today
  const todayDepartures = departures.filter(d => d.departureTime >= time);
  if (todayDepartures.length > 0) {
    validDepartures = todayDepartures.map(d => ({ dep: d, effectiveTime: d.departureTime }));
  } else {
    // 2. Wrap around to tomorrow
    // Take the first few departures from the start of the list
    validDepartures = departures.slice(0, 10).map(d => ({
      dep: d,
      effectiveTime: getEffectiveDepartureTime(d.departureTime, time)
    }));
  }

  let maxScore = -Infinity;
  const currentComplexId = complexMap.get(stationId)!;

  for (const { dep, effectiveTime } of validDepartures) {
    let score = 0;
    const nextComplexId = complexMap.get(dep.nextStationId)!;

    if (!visitedComplexes.has(nextComplexId)) {
      score += 5000;
    } else {
      score -= 200;
    }

    // Cashing In Bonus logic (consistent with findBestMove)
    if (!visitedComplexes.has(currentComplexId)) {
      score += 5000;
    }

    if (lastRouteId && dep.routeId === lastRouteId) {
      score += 500;
    }

    if (tabuList.includes(nextComplexId)) {
      score -= 10000;
    }

    const timeCost = effectiveTime - time;
    score -= timeCost;

    if (score > maxScore) {
      maxScore = score;
    }
  }

  return maxScore === -Infinity ? -10000 : maxScore;
}

function getEffectiveDepartureTime(baseTime: number, currentTime: number): number {
  if (baseTime >= currentTime) return baseTime;
  // Calculate how many days to add
  // If baseTime is 8:00 and currentTime is 9:00, we add 24h -> 32:00.
  // If baseTime is 8:00 and currentTime is 33:00 (9:00 next day), we add 48h -> 56:00.
  const diff = currentTime - baseTime;
  const daysToAdd = Math.ceil(diff / 86400);
  return baseTime + (daysToAdd * 86400);
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}
