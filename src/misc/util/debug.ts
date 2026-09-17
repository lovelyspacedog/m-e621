export const debug = (namespace: string) => (...args: any[]) => {
  if (!import.meta.env.PROD) return;
  console.log(namespace, ...args);
};

/** Dev-only logger. Do not invert `debug()` — that dumps noise on hosted PROD. */
export const debugDev = (namespace: string) => (...args: any[]) => {
  if (import.meta.env.PROD) return;
  console.log(namespace, ...args);
};
