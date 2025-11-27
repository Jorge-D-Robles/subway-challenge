import { Injectable, signal, computed } from '@angular/core';
import { RouteStep, Station } from '../models/gtfs.types';
import { GtfsService } from './gtfs.service';

@Injectable({
    providedIn: 'root'
})
export class PlaybackService {
    private _isPlaying = signal(false);
    private _currentTime = signal(0); // Simulation time in seconds
    private _speedMultiplier = signal(360); // 1 real sec = 6 min
    private _itinerary: RouteStep[] = [];
    private _rafId: number | null = null;
    private _lastFrameTime = 0;
    private _stations: Station[] = [];

    // Signals for UI
    readonly isPlaying = this._isPlaying.asReadonly();
    readonly currentTime = this._currentTime.asReadonly();
    readonly currentPosition = computed(() => this.calculatePosition(this._currentTime()));
    readonly currentAction = computed(() => this.getCurrentAction(this._currentTime()));
    readonly visitedStations = computed(() => this.getVisitedStations(this._currentTime()));

    constructor(private gtfsService: GtfsService) {
        this.gtfsService.getStations().subscribe(stations => {
            this._stations = stations;
        });
    }

    setItinerary(itinerary: RouteStep[], startTime: number) {
        this._itinerary = itinerary;
        this._currentTime.set(startTime);
        this.stop();
    }

    play() {
        if (this._isPlaying()) return;
        this._isPlaying.set(true);
        this._lastFrameTime = performance.now();
        this.loop();
    }

    pause() {
        this._isPlaying.set(false);
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    }

    stop() {
        this.pause();
        if (this._itinerary.length > 0) {
            this._currentTime.set(this._itinerary[0].startTime);
        }
    }

    private loop() {
        if (!this._isPlaying()) return;

        const now = performance.now();
        const delta = (now - this._lastFrameTime) / 1000; // Seconds
        this._lastFrameTime = now;

        const newTime = this._currentTime() + delta * this._speedMultiplier();
        this._currentTime.set(newTime);

        // Check if finished
        if (this._itinerary.length > 0 && newTime >= this._itinerary[this._itinerary.length - 1].endTime) {
            this.pause();
            this._currentTime.set(this._itinerary[this._itinerary.length - 1].endTime);
        } else {
            this._rafId = requestAnimationFrame(() => this.loop());
        }
    }

    private calculatePosition(time: number): { lat: number, lon: number } | null {
        if (this._itinerary.length === 0 || this._stations.length === 0) return null;

        // Find current step
        const step = this._itinerary.find(s => time >= s.startTime && time <= s.endTime);

        if (!step) {
            // Could be between steps or done
            return null;
        }

        const fromStation = this._stations.find(s => s.id === step.fromStation);
        const toStation = this._stations.find(s => s.id === step.toStation);

        if (!fromStation || !toStation) return null;

        if (step.stepType === 'WAIT') {
            return { lat: fromStation.lat, lon: fromStation.lon };
        }

        // Interpolate
        const progress = (time - step.startTime) / (step.endTime - step.startTime);
        const lat = fromStation.lat + (toStation.lat - fromStation.lat) * progress;
        const lon = fromStation.lon + (toStation.lon - fromStation.lon) * progress;

        return { lat, lon };
    }

    private getCurrentAction(time: number): string {
        const step = this._itinerary.find(s => time >= s.startTime && time <= s.endTime);
        return step ? step.description : 'Idle';
    }

    private getVisitedStations(time: number): Set<string> {
        const visited = new Set<string>();
        this._itinerary.forEach(step => {
            if (step.endTime <= time) {
                step.stationsCovered.forEach(s => visited.add(s));
            }
        });
        return visited;
    }
}
