import { Worker } from "worker_threads";
import { EventEmitter } from "events";
import path from "path";

interface Task {
  id: string;
  data: any;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}

interface WorkerInfo {
  worker: Worker;
  busy: boolean;
  id: number;
}

export class ThreadPool extends EventEmitter {
  private workers: WorkerInfo[] = [];
  private taskQueue: Task[] = [];
  private taskIdCounter = 0;

  constructor(
    private poolSize: number = 4,
    private workerScript: string = path.join(__dirname, "worker.js"),
  ) {
    super();
    this.initializeWorkers();
  }

  private initializeWorkers(): void {
    for (let i = 0; i < this.poolSize; i++) {
      const worker = new Worker(this.workerScript);
      const workerInfo: WorkerInfo = {
        worker,
        busy: false,
        id: i,
      };

      worker.on("message", (result) => {
        this.handleWorkerMessage(workerInfo, result);
      });

      worker.on("error", (error) => {
        console.error(`Worker ${i} error:`, error);
        this.emit("workerError", { workerId: i, error });
      });

      worker.on("exit", (code) => {
        if (code !== 0) {
          console.error(`Worker ${i} stopped with exit code ${code}`);
        }
      });

      this.workers.push(workerInfo);
    }
  }

  private handleWorkerMessage(workerInfo: WorkerInfo, result: any): void {
    workerInfo.busy = false;

    // Process the next task in queue if available
    this.processNextTask();

    this.emit("taskComplete", { workerId: workerInfo.id, result });
  }

  private processNextTask(): void {
    const availableWorker = this.workers.find((w) => !w.busy);
    const nextTask = this.taskQueue.shift();

    if (availableWorker && nextTask) {
      this.executeTask(availableWorker, nextTask);
    }
  }

  private executeTask(workerInfo: WorkerInfo, task: Task): void {
    workerInfo.busy = true;

    const messageHandler = (result: any) => {
      workerInfo.worker.off("message", messageHandler);

      if (result.success) {
        task.resolve(result.result);
      } else {
        task.reject(new Error(result.error));
      }
    };

    workerInfo.worker.on("message", messageHandler);
    workerInfo.worker.postMessage(task.data);
  }

  public execute<T>(data: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const task: Task = {
        id: `task-${++this.taskIdCounter}`,
        data,
        resolve,
        reject,
      };

      const availableWorker = this.workers.find((w) => !w.busy);

      if (availableWorker) {
        // Execute immediately if worker is available
        this.executeTask(availableWorker, task);
      } else {
        // Queue the task if all workers are busy
        this.taskQueue.push(task);
      }
    });
  }

  public getStatus() {
    const busyWorkers = this.workers.filter((w) => w.busy).length;
    return {
      totalWorkers: this.workers.length,
      busyWorkers,
      availableWorkers: this.workers.length - busyWorkers,
      queuedTasks: this.taskQueue.length,
    };
  }

  public async terminate(): Promise<void> {
    const terminationPromises = this.workers.map((workerInfo) => workerInfo.worker.terminate());

    await Promise.all(terminationPromises);
    this.workers = [];
    this.taskQueue = [];
  }
}
