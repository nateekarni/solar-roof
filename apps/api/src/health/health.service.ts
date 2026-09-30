import { Injectable, type OnModuleDestroy } from "@nestjs/common";

export interface ReadinessProbe {
  name: string;
  check(signal: AbortSignal): Promise<boolean>;
}

@Injectable()
export class HealthService implements OnModuleDestroy {
  constructor(
    private readonly probes: ReadinessProbe[],
    private readonly timeoutMs = 3000,
    private readonly cleanup: () => void = () => {},
  ) {}

  getSnapshot() {
    return { service: "api", status: "healthy", checkedAt: new Date().toISOString() };
  }

  async getReadiness() {
    const dependencies = await Promise.all(this.probes.map(async probe => {
      const abort = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const healthy = await Promise.race([
          Promise.resolve().then(() => probe.check(abort.signal)),
          new Promise<false>(resolve => { timer = setTimeout(() => { abort.abort(); resolve(false); }, this.timeoutMs); }),
        ]);
        return { name: probe.name, status: healthy ? "healthy" : "unavailable" };
      } catch {
        return { name: probe.name, status: "unavailable" };
      } finally {
        clearTimeout(timer);
      }
    }));
    return {
      service: "api",
      status: dependencies.length > 0 && dependencies.every(dependency => dependency.status === "healthy") ? "ready" : "not_ready",
      dependencies,
      checkedAt: new Date().toISOString(),
    };
  }

  onModuleDestroy() { this.cleanup(); }
}
