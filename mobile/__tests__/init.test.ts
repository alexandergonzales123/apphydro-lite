import { isAcceptableFix, isReliableHeading } from '../src/flow/criteria';
import { Cancelled, createCancelToken, sleep, waitFor } from '../src/flow/wait';
import { createStore, type Store } from '../src/state/store';

/** Store que cuenta sus listeners activos para comprobar que las esperas los quitan. */
function countingStore<T extends object>(initial: T): Store<T> & { listeners: () => number } {
  const inner = createStore(initial);
  let n = 0;
  return {
    get: inner.get,
    set: inner.set,
    subscribe(l) {
      n++;
      const unsub = inner.subscribe(l);
      return () => {
        n--;
        unsub();
      };
    },
    listeners: () => n,
  };
}

describe('waitFor', () => {
  it('resuelve al cumplirse el predicado y quita el listener', async () => {
    const store = countingStore({ v: 0 });
    const { token } = createCancelToken();
    const p = waitFor(store, (s) => s.v === 2, token);
    expect(store.listeners()).toBe(1);
    store.set({ v: 1 });
    store.set({ v: 2 });
    await expect(p).resolves.toBe(true);
    expect(store.listeners()).toBe(0);
  });

  it('al cancelar quita el listener en el acto (sin esperar a que cambie el store) y rechaza con Cancelled', async () => {
    const store = countingStore({ v: 0 });
    const { token, cancel } = createCancelToken();
    const p = waitFor(store, (s) => s.v === 1, token);
    expect(store.listeners()).toBe(1);
    cancel();
    expect(store.listeners()).toBe(0);
    await expect(p).rejects.toBeInstanceOf(Cancelled);
  });

  it('timeout: resuelve false y quita el listener', async () => {
    jest.useFakeTimers();
    try {
      const store = countingStore({ v: 0 });
      const { token } = createCancelToken();
      const p = waitFor(store, (s) => s.v === 1, token, 1500);
      jest.advanceTimersByTime(1500);
      await expect(p).resolves.toBe(false);
      expect(store.listeners()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('ya cancelado: rechaza sin suscribirse', async () => {
    const store = countingStore({ v: 0 });
    const { token, cancel } = createCancelToken();
    cancel();
    await expect(waitFor(store, () => true, token)).rejects.toBeInstanceOf(Cancelled);
    expect(store.listeners()).toBe(0);
  });

  it('sleep se cancela', async () => {
    const { token, cancel } = createCancelToken();
    const p = sleep(10_000, token);
    cancel();
    await expect(p).rejects.toBeInstanceOf(Cancelled);
  });
});

describe('criterios de arranque', () => {
  const fix = (accuracy: number | null) => ({ lat: 0, lon: 0, accuracy, timestamp: 0 });

  it('acepta el primer fix con precisión aceptable (no espera a < 10 m)', () => {
    expect(isAcceptableFix(fix(25), 30)).toBe(true);
    expect(isAcceptableFix(fix(null), 30)).toBe(true);
    expect(isAcceptableFix(fix(65), 30)).toBe(false);
    expect(isAcceptableFix(null, 30)).toBe(false);
  });

  it('rumbo fiable solo con precisión suficiente', () => {
    expect(isReliableHeading({ deg: 10, isTrue: true, accuracy: 3, reference: 'camera' }, 2)).toBe(true);
    expect(isReliableHeading({ deg: 10, isTrue: true, accuracy: 1, reference: 'camera' }, 2)).toBe(false);
    expect(isReliableHeading({ deg: 10, isTrue: true, accuracy: 2, reference: 'deviceTop' }, 2)).toBe(true);
    expect(isReliableHeading(null, 2)).toBe(false);
  });
});
