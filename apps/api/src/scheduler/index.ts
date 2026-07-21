import { createDatabase } from "../db/database.js";
import { readSchedulerConfig } from "./config.js";
import { runSchedulerTick } from "./run.js";
import { createTelegramReminderSender } from "./telegram.js";
import { millisecondsUntilNextMinute } from "./time.js";

const config = readSchedulerConfig();
const database = createDatabase();
await database.ready;

const sendReminder = createTelegramReminderSender(config.token, config.appUrl);
let stopped = false;
let timer: NodeJS.Timeout | undefined;
let activeTick: Promise<void> = Promise.resolve();

async function tick(): Promise<void> {
  try {
    const result = await runSchedulerTick(database.db, sendReminder);
    console.log(JSON.stringify({ event: "scheduler_tick", ...result }));
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "scheduler_tick_error",
        error: error instanceof Error ? error.name : "UnknownError",
      }),
    );
  }
}

function scheduleNextTick(): void {
  if (stopped) return;
  timer = setTimeout(() => {
    activeTick = tick().finally(scheduleNextTick);
  }, millisecondsUntilNextMinute());
}

const shutdown = async () => {
  if (stopped) return;
  stopped = true;
  if (timer) clearTimeout(timer);
  await activeTick;
  database.close();
};

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

activeTick = tick();
await activeTick;
scheduleNextTick();
