import { Station, TrainTrip } from '../../app/models/gtfs.types';

export const STATIONS: Station[] = [
    { id: '101', name: 'Van Cortlandt Park-242 St', lat: 40.889248, lon: -73.898583, line: ['1'], isComplex: false },
    { id: '103', name: '238 St', lat: 40.884667, lon: -73.90087, line: ['1'], isComplex: false },
    { id: '104', name: '231 St', lat: 40.878856, lon: -73.904834, line: ['1'], isComplex: false },
    { id: '120', name: '96 St', lat: 40.793919, lon: -73.972323, line: ['1', '2', '3'], isComplex: true },
    { id: '127', name: 'Times Sq-42 St', lat: 40.75529, lon: -73.987495, line: ['1', '2', '3', '7', 'A', 'C', 'E'], isComplex: true, complexId: 'TSQ' },
    { id: '128', name: '34 St-Penn Station', lat: 40.750373, lon: -73.991057, line: ['1', '2', '3'], isComplex: true },
    { id: '132', name: '14 St', lat: 40.737826, lon: -74.000201, line: ['1', '2', '3'], isComplex: true },
    { id: '137', name: 'Chambers St', lat: 40.715478, lon: -74.009266, line: ['1', '2', '3'], isComplex: true },
    { id: '142', name: 'South Ferry', lat: 40.702068, lon: -74.013664, line: ['1'], isComplex: true },

    { id: 'A02', name: 'Inwood-207 St', lat: 40.868072, lon: -73.919899, line: ['A'], isComplex: false },
    { id: 'A03', name: 'Dyckman St', lat: 40.865491, lon: -73.927271, line: ['A'], isComplex: false },
    { id: 'A27', name: '42 St-Port Authority Bus Terminal', lat: 40.757308, lon: -73.989735, line: ['A', 'C', 'E'], isComplex: true, complexId: 'TSQ' },
    { id: 'A28', name: '34 St-Penn Station', lat: 40.752287, lon: -73.993391, line: ['A', 'C', 'E'], isComplex: true },
    { id: 'A32', name: 'W 4 St-Wash Sq', lat: 40.732338, lon: -74.000495, line: ['A', 'C', 'E', 'B', 'D', 'F', 'M'], isComplex: true },
    { id: 'A55', name: 'Howard Beach-JFK Airport', lat: 40.660476, lon: -73.830301, line: ['A'], isComplex: true },
    { id: 'A65', name: 'Far Rockaway-Mott Av', lat: 40.603995, lon: -73.755405, line: ['A'], isComplex: false },

    { id: '701', name: 'Flushing-Main St', lat: 40.7596, lon: -73.83003, line: ['7'], isComplex: true },
    { id: '702', name: 'Mets-Willets Point', lat: 40.754622, lon: -73.845625, line: ['7'], isComplex: true },
    { id: '723', name: '42 St-Bryant Pk', lat: 40.754222, lon: -73.984565, line: ['7', 'B', 'D', 'F', 'M'], isComplex: true },
    { id: '724', name: 'Times Sq-42 St', lat: 40.755477, lon: -73.987691, line: ['7'], isComplex: true, complexId: 'TSQ' },
    { id: '726', name: '34 St-Hudson Yards', lat: 40.755882, lon: -74.00191, line: ['7'], isComplex: false },
];

// Helper to generate trips
function generateTrips(routeId: string, stops: string[], intervalMinutes: number, startTimeSeconds: number, endTimeSeconds: number): TrainTrip[] {
    const trips: TrainTrip[] = [];
    let tripCounter = 1;

    for (let time = startTimeSeconds; time < endTimeSeconds; time += intervalMinutes * 60) {
        const stopTimes = stops.map((stationId, index) => ({
            stationId,
            arrivalTime: time + index * 120, // 2 minutes between stops
            departureTime: time + index * 120 + 30 // 30 seconds dwell
        }));

        trips.push({
            routeId,
            tripId: `${routeId}-${tripCounter++}`,
            serviceId: 'Weekday',
            stopTimes
        });
    }
    return trips;
}

export const TRIPS: TrainTrip[] = [
    ...generateTrips('1', ['101', '103', '104', '120', '127', '128', '132', '137', '142'], 10, 0, 86400),
    ...generateTrips('A', ['A02', 'A03', '120', 'A27', 'A28', 'A32', 'A55', 'A65'], 15, 0, 86400), // Simplified A stops
    ...generateTrips('7', ['701', '702', '723', '724', '726'], 5, 0, 86400)
];
