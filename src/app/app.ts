import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlPanelComponent } from './components/control-panel/control-panel';
import { MapOverlayComponent } from './components/map-overlay/map-overlay';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, ControlPanelComponent, MapOverlayComponent],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class AppComponent {
  title = 'subway-challenge';
}
