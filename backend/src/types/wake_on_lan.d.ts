declare module 'wake_on_lan' {
  interface WakeOptions {
    address?: string;
    port?: number;
    num_packets?: number;
    interval?: number;
  }

  function wake(mac: string, options: WakeOptions, callback: (err: Error | null) => void): void;
  function wake(mac: string, callback: (err: Error | null) => void): void;

  export { wake };
  const wol: { wake: typeof wake };
  export default wol;
}
