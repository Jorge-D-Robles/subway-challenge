import { Injectable } from '@angular/core';
import { Observable, from, forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';
import { Station, TrainTrip } from '../models/gtfs.types';

@Injectable({
    providedIn: 'root'
})
export class GtfsService {
    private baseUrl = 'assets/data/gtfs';

    constructor() { }

    getStations(): Observable<Station[]> {
        return from(fetch(`${this.baseUrl}/stops.txt`).then(res => res.text())).pipe(
            map(data => this.parseStations(data))
        );
    }

    getTrips(): Observable<TrainTrip[]> {
        return forkJoin({
            trips: from(fetch(`${this.baseUrl}/trips.txt`).then(res => res.text())),
            stopTimes: from(fetch(`${this.baseUrl}/stop_times.txt`).then(res => res.text()))
        }).pipe(
            map(({ trips, stopTimes }) => this.parseSchedule(trips, stopTimes))
        );
    }

    private parseStations(csv: string): Station[] {
        const lines = csv.split('\n');
        const stations: Station[] = [];

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const row = this.parseCsvLine(lines[i]);
            const station: any = {};

            // stops.txt: stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station
            station.id = row[0];
            station.name = row[1];
            station.lat = parseFloat(row[2]);
            station.lon = parseFloat(row[3]);
            station.line = [];
            station.isComplex = false;

            if (station.name && !isNaN(station.lat)) {
                stations.push(station);
            }
        }
        return stations;
    }

    private parseSchedule(tripsCsv: string, stopTimesCsv: string): TrainTrip[] {
        const tripsLines = tripsCsv.split('\n');
        const stopTimesLines = stopTimesCsv.split('\n');
        const tripsMap = new Map<string, TrainTrip>();

        // Parse Trips
        // route_id,trip_id,service_id,...
        for (let i = 1; i < tripsLines.length; i++) {
            if (!tripsLines[i].trim()) continue;
            const row = this.parseCsvLine(tripsLines[i]);
            tripsMap.set(row[1], {
                routeId: row[0],
                tripId: row[1],
                serviceId: row[2],
                stopTimes: []
            });
        }

        // Parse Stop Times
        // trip_id,stop_id,arrival_time,departure_time,stop_sequence
        for (let i = 1; i < stopTimesLines.length; i++) {
            if (!stopTimesLines[i].trim()) continue;
            const row = this.parseCsvLine(stopTimesLines[i]);
            const tripId = row[0];
            const trip = tripsMap.get(tripId);

            if (trip) {
                trip.stopTimes.push({
                    stationId: row[1],
                    arrivalTime: this.timeToSeconds(row[2]),
                    departureTime: this.timeToSeconds(row[3])
                });
            }
        }

        return Array.from(tripsMap.values());
    }

    private parseCsvLine(line: string): string[] {
        // Simple CSV parser handling quotes
        const result = [];
        let start = 0;
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            if (line[i] === '"') {
                inQuotes = !inQuotes;
            } else if (line[i] === ',' && !inQuotes) {
                result.push(line.substring(start, i).replace(/^"|"$/g, ''));
                start = i + 1;
            }
        }
        result.push(line.substring(start).replace(/^"|"$/g, ''));
        return result;
    }

    private timeToSeconds(timeStr: string): number {
        const [h, m, s] = timeStr.split(':').map(Number);
        return h * 3600 + m * 60 + s;
    }
}
