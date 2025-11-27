import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { ChallengeResult } from '../models/gtfs.types';

@Injectable({
    providedIn: 'root'
})
export class SolverService {
    private worker: Worker | undefined;

    constructor() {
        if (typeof Worker !== 'undefined') {
            this.worker = new Worker(new URL('../pathfinder.worker', import.meta.url));
        }
    }

    solve(startTime: number): Observable<ChallengeResult> {
        const resultSubject = new Subject<ChallengeResult>();

        if (this.worker) {
            this.worker.onmessage = ({ data }) => {
                if (data.type === 'RESULT') {
                    resultSubject.next(data.payload as ChallengeResult);
                    resultSubject.complete();
                } else if (data.type === 'ERROR') {
                    resultSubject.error(data.payload);
                }
            };

            this.worker.postMessage({ command: 'SOLVE', startTime });
        } else {
            resultSubject.error('Worker not initialized');
        }

        return resultSubject.asObservable();
    }
}
