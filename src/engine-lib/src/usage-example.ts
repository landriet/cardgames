// usage-example.ts - How to use the thread pool
import { ThreadPool } from "./thread-pool";

async function main() {
  // Create a thread pool with 4 workers
  const pool = new ThreadPool(4);

  // Listen to events
  pool.on("taskComplete", ({ workerId, result }) => {
    console.log(`Task completed by worker ${workerId}:`, result);
  });

  try {
    console.log("Starting tasks...");
    console.log("Pool status:", pool.getStatus());

    // Execute all tasks concurrently
    const results = await Promise.all(tasks.map((taskData) => pool.execute(taskData)));

    console.log("All tasks completed!");
    console.log("Results:", results);
    console.log("Final pool status:", pool.getStatus());
  } catch (error) {
    console.error("Error executing tasks:", error);
  } finally {
    // Clean up
    await pool.terminate();
    console.log("Thread pool terminated");
  }
}

// Run the example
main().catch(console.error);
