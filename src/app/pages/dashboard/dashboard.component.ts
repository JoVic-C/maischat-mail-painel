import { Component, OnInit } from '@angular/core';
import { ActivityPoint, DashboardStats } from '../../models';
import { ApiService } from '../../services/api.service';
import { apiErrorMessage } from '../../shared/server-errors/server-errors';

@Component({
    selector: 'app-dashboard',
    templateUrl: './dashboard.component.html',
    styleUrls: ['./dashboard.component.scss'],
    standalone: false
})
export class DashboardComponent implements OnInit {
  stats: DashboardStats | null = null;
  activity: ActivityPoint[] = [];
  totals = { sent: 0, opened: 0, clicked: 0, failed: 0 };

  loadingStats = false;
  statsError: string | null = null;
  loadingActivity = false;
  activityError: string | null = null;

  private maxSent = 1;

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.loadStats();
    this.loadActivity();
  }

  loadStats(): void {
    this.loadingStats = true;
    this.statsError = null;
    this.api.dashboardStats().subscribe({
      next: (stats) => {
        this.stats = stats;
        this.loadingStats = false;
      },
      error: (err) => {
        this.loadingStats = false;
        this.statsError = apiErrorMessage(err);
      },
    });
  }

  loadActivity(): void {
    this.loadingActivity = true;
    this.activityError = null;
    this.api.dashboardActivity().subscribe({
      next: (activity) => {
        this.activity = activity;
        this.loadingActivity = false;
        this.maxSent = Math.max(1, ...activity.map((a) => a.sent));
        this.totals = activity.reduce(
          (acc, a) => ({
            sent: acc.sent + a.sent,
            opened: acc.opened + a.opened,
            clicked: acc.clicked + a.clicked,
            failed: acc.failed + a.failed,
          }),
          { sent: 0, opened: 0, clicked: 0, failed: 0 }
        );
      },
      error: (err) => {
        this.loadingActivity = false;
        this.activityError = apiErrorMessage(err);
      },
    });
  }

  barHeight(sent: number): number {
    return Math.max(4, (sent / this.maxSent) * 100);
  }

  pct(part: number, total: number): number {
    return total ? Math.round((part / total) * 100) : 0;
  }

}
