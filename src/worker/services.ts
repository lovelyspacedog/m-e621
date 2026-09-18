import type { Remote } from "comlink";
import { wrap } from "comlink";
import type { ApiService } from "./ApiService";
import type { AnalyzeService } from "./AnalyzeService";
import type { DashboardService } from "./DashboardService";

// const workerOptions = import.meta.env.PROD ? {} : { type: "module" as const };

const wrapWorker = async <T>(worker: Worker): Promise<Remote<T>> => {
  const WrappedService = wrap<T>(worker);
  const Ctor = WrappedService as unknown as new () => Promise<Remote<T>>;
  return new Ctor();
};

// Store the Promise (not the resolved value) so concurrent callers share one
// in-flight spawn rather than each racing to create a separate worker.
let apiServicePromise: Promise<Remote<ApiService>> | undefined;

export const getApiService = () =>
  (apiServicePromise ??= wrapWorker<ApiService>(
    new Worker(new URL("./ApiServiceWorker", import.meta.url), { type: "module" }),
  ));

let analyzeServicePromise: Promise<Remote<AnalyzeService>> | undefined;

export const getAnalyzeService = () =>
  (analyzeServicePromise ??= wrapWorker<AnalyzeService>(
    new Worker(new URL("./AnalyzeService", import.meta.url), { type: "module" }),
  ));

let dashboardServicePromise: Promise<Remote<DashboardService>> | undefined;

export const getDashboardService = () =>
  (dashboardServicePromise ??= wrapWorker<DashboardService>(
    new Worker(new URL("./DashboardService", import.meta.url), { type: "module" }),
  ));
