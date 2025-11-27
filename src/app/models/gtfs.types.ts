export interface Station {
    id: string; // GTFS Stop ID
    name: string;
    lat: number;
    lon: number;
    line: string[]; // e.g., ['1', '2', 'A']
    isComplex: boolean; // Part of a station complex (e.g., Times Sq)
    parentId?: string;
    complexId?: string; // To link internal transfers
}

export interface Edge {
    fromStationId: string;
    toStationId: string;
    type: 'RAIL' | 'WALK' | 'BUS';
    durationSeconds: number; // For walking/running
    routeId?: string; // e.g., 'A', 'M15'
}

export interface TrainTrip {
    routeId: string;
    tripId: string;
    serviceId: string; // Weekday vs Weekend
    stopTimes: {
        stationId: string;
        arrivalTime: number; // Seconds from midnight
        departureTime: number;
    }[];
}

export interface RouteStep {
    stepType: 'RIDE' | 'TRANSFER' | 'WAIT' | 'WALK';
    fromStation: string;
    toStation: string;
    routeId?: string; // Train line or 'Foot'
    startTime: number; // Unix timestamp or seconds from start
    endTime: number;
    stationsCovered: string[]; // IDs of stations "visited" during this step
    description: string; // "Take A Train to Far Rockaway"
}

export interface ChallengeResult {
    totalTime: string;
    stationsVisitedCount: number;
    visitedStationIds: Set<string>;
    itinerary: RouteStep[];
    startTime: string;
    startStationId: string;
}
