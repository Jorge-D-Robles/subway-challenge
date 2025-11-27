import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SolverService } from '../../services/solver.service';
import { PlaybackService } from '../../services/playback.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-control-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './control-panel.html',
  styleUrl: './control-panel.css'
})
export class ControlPanelComponent {
  isCalculating = signal(false);
  hasResult = signal(false);
  statusMessage = signal('');

  constructor(
    private solverService: SolverService,
    public playbackService: PlaybackService
  ) { }

  async calculateRoute() {
    this.isCalculating.set(true);
    this.statusMessage.set('Loading data and calculating...');

    try {
      // Start at 8:00 AM today
      // Use seconds from midnight for the solver (GTFS uses this format)
      // 8:00 AM = 8 * 3600 = 28800
      const startTime = 8 * 3600;
      const result = await firstValueFrom(this.solverService.solve(startTime));

      this.playbackService.setItinerary(result.itinerary, startTime);
      this.hasResult.set(true);
      this.statusMessage.set(`Found route! Duration: ${result.totalTime}`);

    } catch (err) {
      console.error('Calculation failed', err);
      this.statusMessage.set('Calculation failed. Check console.');
    } finally {
      this.isCalculating.set(false);
    }
  }

  togglePlay() {
    if (this.playbackService.isPlaying()) {
      this.playbackService.pause();
    } else {
      this.playbackService.play();
    }
  }
}
