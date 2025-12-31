export class Scheduler {
  private intervalId: Timer | null = null;
  private intervalMs: number;
  private task: () => Promise<void>;

  constructor(intervalSeconds: number, task: () => Promise<void>) {
    this.intervalMs = intervalSeconds * 1000;
    this.task = task;
  }

  start() {
    if (this.intervalId) {
      console.warn("Scheduler is already running.");
      return;
    }

    console.log(`Starting scheduler with interval: ${this.intervalMs}ms`);

    // Run immediately on start
    this.task().catch((error) => {
      console.error(`Scheduled task failed: ${error}`);
    });

    // Then run at intervals
    this.intervalId = setInterval(async () => {
      try {
        await this.task();
      } catch (error) {
        console.error(`Scheduled task failed: ${error}`);
      }
    }, this.intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("Scheduler stopped.");
    }
  }
}
