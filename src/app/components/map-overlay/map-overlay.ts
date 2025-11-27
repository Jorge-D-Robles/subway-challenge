import { Component, ElementRef, OnInit, effect, inject, ViewChild, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GtfsService } from '../../services/gtfs.service';
import { PlaybackService } from '../../services/playback.service';
import { Station } from '../../models/gtfs.types';
import * as L from 'leaflet';

@Component({
  selector: 'app-map-overlay',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './map-overlay.html',
  styleUrls: ['./map-overlay.css']
})
export class MapOverlayComponent implements OnInit, OnDestroy {
  private gtfsService = inject(GtfsService);
  private playbackService = inject(PlaybackService);

  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef;

  private map!: L.Map;
  private stations: Station[] = [];
  private stationMarkers: L.CircleMarker[] = [];
  private playerMarker: L.CircleMarker | null = null;

  constructor() {
    // Effect to update player position
    effect(() => {
      const pos = this.playbackService.currentPosition();
      if (pos && this.map) {
        this.updatePlayer(pos);
      }
    });

    // Effect to highlight visited stations
    effect(() => {
      const visited = this.playbackService.visitedStations();
      if (this.map && this.stations.length > 0) {
        this.updateVisitedStations(visited);
      }
    });
  }

  ngOnInit() {
    this.initMap();

    this.gtfsService.getStations().subscribe(stations => {
      this.stations = stations;
      this.renderStations();
    });
  }

  ngOnDestroy() {
    if (this.map) {
      this.map.remove();
    }
  }

  private initMap() {
    this.map = L.map(this.mapContainer.nativeElement).setView([40.7128, -74.0060], 11);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(this.map);
  }

  private renderStations() {
    // Clear existing
    this.stationMarkers.forEach(m => m.remove());
    this.stationMarkers = [];

    this.stations.forEach(station => {
      const marker = L.circleMarker([station.lat, station.lon], {
        radius: 3,
        fillColor: '#333',
        color: '#000',
        weight: 1,
        opacity: 0.5,
        fillOpacity: 0.5
      }).addTo(this.map);

      // Store ID for easy lookup if needed, or just index
      // We can attach data to the marker options or keep a map
      (marker as any).stationId = station.id;
      this.stationMarkers.push(marker);
    });
  }

  private updatePlayer(pos: { lat: number, lon: number }) {
    if (!this.playerMarker) {
      this.playerMarker = L.circleMarker([pos.lat, pos.lon], {
        radius: 6,
        fillColor: '#ff0000',
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 1
      }).addTo(this.map);
    } else {
      this.playerMarker.setLatLng([pos.lat, pos.lon]);
    }
  }

  private updateVisitedStations(visited: Set<string>) {
    this.stationMarkers.forEach(marker => {
      const stationId = (marker as any).stationId;
      const station = this.stations.find(s => s.id === stationId);

      if (station && (visited.has(station.id) || (station.parentId && visited.has(station.parentId)))) {
        // Check if already highlighted to avoid re-applying and stacking opacity
        if ((marker as any)._isHighlighted) return;

        marker.setStyle({
          fillColor: '#00ff00',
          color: '#006600',
          fillOpacity: 0.8,
          opacity: 1 // Ensure border is fully opaque
        });
        (marker as any)._isHighlighted = true;
      }
    });
  }
}
