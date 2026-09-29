/**
 * Esperas cancelables (PURO, sin React Native) para la orquestación de la inicialización.
 *
 * Al cancelar, cada espera pendiente quita su listener del store y su temporizador en el acto
 * (no espera a que el store cambie) y rechaza con `Cancelled`.
 */
import type { Store } from '../state/store';

export class Cancelled extends Error {
  constructor() {
    super('Cancelado');
    this.name = 'Cancelled';
  }
}

export interface CancelToken {
  readonly cancelled: boolean;
  /** Registra una función que se llama al cancelar. Devuelve la función para des-registrarla. */
  onCancel(cb: () => void): () => void;
}

export function createCancelToken(): { token: CancelToken; cancel: () => void } {
  let cancelled = false;
  const cbs = new Set<() => void>();
  return {
    token: {
      get cancelled() {
        return cancelled;
      },
      onCancel(cb) {
        cbs.add(cb);
        return () => cbs.delete(cb);
      },
    },
    cancel() {
      if (cancelled) return;
      cancelled = true;
      const list = [...cbs];
      cbs.clear();
      list.forEach((cb) => cb());
    },
  };
}

/**
 * Resuelve `true` en cuanto `predicate` se cumple. Con `timeoutMs`, al agotarse resuelve con el
 * valor del predicado en ese momento (normalmente `false`). Rechaza con `Cancelled` si se cancela.
 */
export function waitFor<T extends object>(
  store: Store<T>,
  predicate: (s: T) => boolean,
  token: CancelToken,
  timeoutMs?: number,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (token.cancelled) return reject(new Cancelled());
    if (predicate(store.get())) return resolve(true);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      unsub();
      offCancel();
      if (timer !== undefined) clearTimeout(timer);
    };
    const unsub = store.subscribe(() => {
      if (predicate(store.get())) {
        cleanup();
        resolve(true);
      }
    });
    const offCancel = token.onCancel(() => {
      cleanup();
      reject(new Cancelled());
    });
    if (timeoutMs !== undefined) {
      timer = setTimeout(() => {
        cleanup();
        resolve(predicate(store.get()));
      }, Math.max(0, timeoutMs));
    }
  });
}

/** setTimeout como promesa, cancelable. */
export function sleep(ms: number, token: CancelToken): Promise<void> {
  return new Promise((resolve, reject) => {
    if (token.cancelled) return reject(new Cancelled());
    const offCancel = token.onCancel(() => {
      clearTimeout(timer);
      reject(new Cancelled());
    });
    const timer = setTimeout(() => {
      offCancel();
      resolve();
    }, Math.max(0, ms));
  });
}
